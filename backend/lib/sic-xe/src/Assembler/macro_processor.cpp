#include "assembler/macro_processor.hpp"

#include <algorithm>
#include <utility>

#include "assembler/isa.hpp"
#include "macro_text.hpp"

namespace sicxe {
namespace {

using namespace macro_text;

// ---- the one-pass algorithm (spec 4.4) ------------------------------------------

struct FormalEntry {
  std::string upper;
  int level = 0;
  int index = 0;
};

// A range of a source line, where an error is reported.
struct SourceRange {
  int line = 0;
  int column = 0;
  int length = 0;
};

struct Fields {
  std::string_view label, op, operands;
  std::size_t labelOffset = 0, opOffset = 0, operandsOffset = 0;
};

// The definition being read at level 1: prototype first, MCEND last.
struct DefinitionInProgress {
  bool failed = false;  // missing prototype or unusable name: not entered in the tables
  std::string name, prototype, labelFormal;
  std::vector<Formal> formals;
  int originLine = 0;    // the MCDEFN line, 0 when created by an expansion
  int originSerial = 0;  // the expansion that created it, 0 when written in the source
  int prototypeLine = 0;
  bool hasNested = false;
  std::vector<PieceLine> lines;
  std::vector<int> sourceLines;
};

// An expansion being read: the top frame of the expansion stack supplies the next line.
struct Frame {
  int definition = 0;
  std::size_t next = 0;              // next stored line: 0 is the prototype, the last is MCEND
  std::vector<std::string> actuals;  // #0..#n
  int serial = 0;
  SourceRange call;                  // the outermost call's macro name: generated lines map to its
                                     // line, and errors found while expanding are reported there
  bool crlf = false;                 // generated lines end in '\r' when that call line did
  std::size_t expansion = 0;         // its entry in result.expansions
};

// A line to process (spec 4.4): read from the source, or from the top expansion frame
// with its markers already substituted.
struct Line {
  std::string_view raw;               // as read, with any '\r'
  std::string_view content;           // without '\r'; an expansion line as text
  int number = 0;                     // source line, 0 when read from an expansion
  const PieceLine* pieces = nullptr;  // the expansion line, null for a source line
};

// 1-based index of the formal called `name` (case-insensitive), 0 if there is none.
std::size_t formalIndex(const MacroDefinition& def, std::string_view name) {
  const std::string upper = toUpper(name);
  for (std::size_t i = 0; i < def.formals.size(); ++i)
    if (toUpper(def.formals[i].name) == upper) return i + 1;
  return 0;
}

class OnePass {
 public:
  OnePass(const MacroProcessorOptions& options, MacroResult& result)
      : options_(options), result_(result) {}

  // A source line, then every line its call put on the expansion stack. Nothing is read
  // once a limit has stopped the processing.
  void read(std::string_view raw, int lineNo) {
    if (stopped_) return;
    process({raw, withoutCr(raw), lineNo, nullptr});
    expand();
  }

  void finish() {
    if (awaitingPrototype_) missingPrototype();
    for (const SourceRange& open : levels_) error(open, "MCDEFN without MCEND");
    result_.diagnostics = diags_.sorted();
  }

 private:
  int d() const { return static_cast<int>(levels_.size()); }

  // One line through the Normal / Definition / Expansion logic of spec 4.4, the same for
  // a source line and a line read from an expansion.
  void process(const Line& line) {
    const std::string_view code = codeOf(line.content);
    const Fields f = fields(code);
    const std::string keyword = toUpper(operationMnemonic(f.op));
    const bool isDefn = keyword == "MCDEFN";
    const bool isEnd = keyword == "MCEND";

    if (awaitingPrototype_ && !isDefn && !isEnd) {
      // Comments and blank lines before the prototype do not count as one.
      if (trim(code).empty()) {
        if (d() > 1) store(asRead(line), line);
      } else {
        prototype(line, code);
      }
      return;
    }
    if (awaitingPrototype_) missingPrototype();

    if (isDefn) defineStart(f, line);
    else if (isEnd) defineEnd(f, line);
    else if (d() > 0) store(line.pieces ? *line.pieces : bodyLine(line.content), line);
    else if (const int slot = nameSlot(toUpper(f.op)); slot >= 0) call(f, line, slot);
    else if (line.pieces) emitGenerated(std::string(line.content), LineKind::Expanded);
    else copy(line.raw, line.number);
  }

  // A line stored as read: the source text, or the pieces of an expansion line.
  static PieceLine asRead(const Line& line) { return line.pieces ? *line.pieces : textLine(line.content); }

  // Where an error on `line` goes: `offset` of a source line, or the macro name of the
  // outermost call for a line read from an expansion.
  SourceRange rangeAt(const Line& line, std::size_t offset, std::size_t length) const {
    if (line.pieces) return frames_.back().call;
    return {line.number, static_cast<int>(offset) + 1, static_cast<int>(std::max<std::size_t>(length, 1))};
  }

  void error(const SourceRange& at, std::string message) {
    diags_.error(at.line, at.column, std::move(message), at.length);
  }

  // Assembler field rule, extended: field 1 is the operation when it names an
  // instruction, a directive, MCDEFN/MCEND or a macro defined so far.
  Fields fields(std::string_view code) const {
    Fields f;
    std::size_t pos = 0;
    Token t = nextToken(code, pos);
    if (!t.text.empty() && !isOperationName(t.text)) {
      f.label = t.text;
      f.labelOffset = t.offset;
      t = nextToken(code, pos);
    }
    f.op = t.text;
    f.opOffset = t.offset;
    while (pos < code.size() && isSpace(code[pos])) ++pos;
    f.operands = trim(code.substr(pos));
    f.operandsOffset = pos;
    return f;
  }

  bool isOperationName(std::string_view field) const {
    const std::string upper = toUpper(operationMnemonic(field));
    return upper == "MCDEFN" || upper == "MCEND" || options_.isOperation(upper) ||
           nameSlot(upper) >= 0;
  }

  int nameSlot(std::string_view upper) const {
    for (std::size_t i = 0; i < result_.names.size(); ++i)
      if (result_.names[i].name == upper) return static_cast<int>(i);
    return -1;
  }

  // Formal-parameter stack, searched from the top; only levels up to maxLevel.
  std::optional<Piece> findFormal(std::string_view word, int maxLevel) const {
    const std::string upper = toUpper(word);
    for (auto it = formals_.rbegin(); it != formals_.rend(); ++it)
      if (it->level <= maxLevel && it->upper == upper)
        return Piece{Piece::Kind::Param, {}, it->level, it->index};
    return std::nullopt;
  }

  // A source line inside a definition: every formal on the stack is visible.
  PieceLine bodyLine(std::string_view content) const {
    return toPieces(content, [this](std::string_view word, std::size_t) { return findFormal(word, d()); });
  }

  void keywordAlone(const Fields& f, const char* keyword, const Line& line) {
    const std::string message = std::string(keyword) + " takes no label or operands";
    if (!f.label.empty()) error(rangeAt(line, f.labelOffset, f.label.size()), message);
    else if (!f.operands.empty()) error(rangeAt(line, f.operandsOffset, f.operands.size()), message);
  }

  // A definition started by an expansion records the expansion's serial (spec 4.4).
  void defineStart(const Fields& f, const Line& line) {
    result_.hasMacros = true;
    keywordAlone(f, "MCDEFN", line);
    levels_.push_back(rangeAt(line, f.opOffset, f.op.size()));
    if (d() == 1) {
      current_ = {};
      current_.originLine = line.number;
      if (line.pieces) current_.originSerial = frames_.back().serial;
    } else {
      current_.hasNested = true;
      store(asRead(line), line);
    }
    awaitingPrototype_ = true;
  }

  void defineEnd(const Fields& f, const Line& line) {
    keywordAlone(f, "MCEND", line);
    if (d() == 0) {
      error(rangeAt(line, f.opOffset, f.op.size()), "MCEND without MCDEFN");
      return;
    }
    while (!formals_.empty() && formals_.back().level == d()) formals_.pop_back();
    store(asRead(line), line);
    levels_.pop_back();
    if (d() == 0) closeDefinition();
  }

  void missingPrototype() {
    awaitingPrototype_ = false;
    error(levels_.back(), "Missing prototype after MCDEFN");
    if (d() == 1) current_.failed = true;
  }

  // Formals of level d() are pushed before the line is stored. At level 1 the line is
  // the new definition's prototype; deeper, it is a body line whose own formal names
  // stay as written while names of enclosing levels become markers (Figure 4.10). A
  // line read from an expansion already has those markers.
  void prototype(const Line& line, std::string_view code) {
    awaitingPrototype_ = false;
    Prototype p = parsePrototype(code);
    std::vector<std::size_t> ownNames;
    if (!p.label.empty()) ownNames.push_back(p.labelOffset);
    for (const PrototypeFormal& f : p.formals) ownNames.push_back(f.offset);

    const bool usable = checkPrototype(p, line, d() == 1);
    if (!p.label.empty()) formals_.push_back({toUpper(p.label), d(), 0});
    for (std::size_t i = 0; i < p.formals.size(); ++i)
      formals_.push_back({toUpper(p.formals[i].name), d(), static_cast<int>(i) + 1});

    if (d() > 1) {
      auto enclosingFormal = [&](std::string_view word, std::size_t offset) -> std::optional<Piece> {
        if (std::find(ownNames.begin(), ownNames.end(), offset) != ownNames.end()) return std::nullopt;
        return findFormal(word, d() - 1);
      };
      store(line.pieces ? *line.pieces : toPieces(line.content, enclosingFormal), line);
      return;
    }
    current_.failed = current_.failed || !usable;
    current_.name = toUpper(p.name);
    current_.prototype = std::string(trim(code));
    current_.labelFormal = p.label;
    for (const PrototypeFormal& f : p.formals) current_.formals.push_back({f.name, f.defaultValue});
    current_.prototypeLine = line.number;
    store(textLine(line.content), line);
  }

  // Drops invalid and repeated formals (reporting them when `report`), so indices
  // match the formal list. Returns false when the name cannot be a macro name.
  bool checkPrototype(Prototype& p, const Line& line, bool report) {
    auto problem = [&](std::size_t offset, std::size_t length, const std::string& message) {
      if (report) error(rangeAt(line, offset, length), message);
    };
    bool usable = true;
    const std::string upper = toUpper(p.name);
    if (!isIdentifier(p.name)) {
      problem(p.nameOffset, p.name.size(), "Invalid macro name '" + p.name + "'");
      usable = false;
    } else if (options_.isOperation(upper)) {
      const char* what = findDirective(upper) ? "a directive" : "an instruction";
      problem(p.nameOffset, p.name.size(),
              "'" + p.name + "' is " + what + " and cannot be a macro name");
      usable = false;
    }

    std::vector<std::string> seen;
    auto keep = [&](const std::string& name, std::size_t offset) {
      if (!isIdentifier(name)) {
        problem(offset, name.size(), "Invalid formal '" + name + "' in prototype");
        return false;
      }
      const std::string formal = toUpper(name);
      for (const std::string& s : seen)
        if (s == formal) {
          problem(offset, name.size(), "Duplicate formal '" + name + "' in prototype");
          return false;
        }
      seen.push_back(formal);
      return true;
    };
    if (!p.label.empty() && !keep(p.label, p.labelOffset)) p.label.clear();
    std::vector<PrototypeFormal> kept;
    for (PrototypeFormal& f : p.formals)
      if (keep(f.name, f.offset)) kept.push_back(std::move(f));
    p.formals = std::move(kept);
    return usable;
  }

  void store(PieceLine stored, const Line& line) {
    current_.lines.push_back(std::move(stored));
    current_.sourceLines.push_back(line.number);
  }

  // Level 1 closed: the definition enters the definition table and the name table.
  // A redefinition leaves the previous definition in the table, inactive.
  void closeDefinition() {
    DefinitionInProgress done = std::move(current_);
    current_ = {};
    if (done.failed) return;

    MacroDefinition def;
    def.index = static_cast<int>(result_.definitions.size());
    def.name = done.name;
    def.prototype = std::move(done.prototype);
    def.labelFormal = std::move(done.labelFormal);
    def.formals = std::move(done.formals);
    def.originSourceLine = done.originLine;
    def.originSerial = done.originSerial;
    def.hasNested = done.hasNested;
    for (const PieceLine& line : done.lines) def.displayBody.push_back(displayForm(line, done.hasNested));
    def.bodySourceLines = std::move(done.sourceLines);

    if (const int slot = nameSlot(def.name); slot >= 0) {
      MacroName& entry = result_.names[static_cast<std::size_t>(slot)];
      result_.definitions[static_cast<std::size_t>(entry.definition)].active = false;
      entry.definition = def.index;
      entry.line = done.prototypeLine;
    } else {
      result_.names.push_back({def.name, def.index, done.prototypeLine});
    }
    result_.definitions.push_back(std::move(def));
    bodies_.push_back(std::move(done.lines));
  }

  // A call (spec 4.2, 4.5), in the source or nested in an expansion: a new frame on the
  // expansion stack, then the call as a '.' comment (a nested call with its actuals in
  // place) and "LABEL EQU *" when the call has a label and the prototype has no label
  // formal. expand() then reads the body from the frame.
  void call(const Fields& f, const Line& line, int slot) {
    const MacroName& name = result_.names[static_cast<std::size_t>(slot)];
    const MacroDefinition& def = result_.definitions[static_cast<std::size_t>(name.definition)];
    const bool nested = line.pieces != nullptr;
    const int depth = static_cast<int>(frames_.size()) + 1;
    Frame frame;
    frame.call = rangeAt(line, f.opOffset, f.op.size());
    if (depth > options_.maxDepth) {
      stop(frame.call, "Macro expansion too deep (limit " + std::to_string(options_.maxDepth) + "): " + def.name);
      return;
    }
    if (serial_ >= options_.maxExpansions) {
      stop(frame.call, "Too many macro expansions (limit " + std::to_string(options_.maxExpansions) + ")");
      return;
    }
    frame.definition = def.index;
    frame.actuals = bindActuals(def, f, line);
    frame.serial = ++serial_;
    frame.crlf = nested ? frames_.back().crlf : line.raw.size() != line.content.size();
    frame.expansion = result_.expansions.size();

    Expansion e;
    e.serial = frame.serial;
    e.macro = def.name;
    e.definition = def.index;
    e.parent = nested ? frames_.back().serial : 0;
    e.depth = depth;
    e.callLine = frame.call.line;
    e.callText = std::string(line.content);
    if (!def.labelFormal.empty()) e.actuals.push_back({0, def.labelFormal, frame.actuals[0]});
    for (std::size_t i = 0; i < def.formals.size(); ++i)
      e.actuals.push_back({static_cast<int>(i) + 1, def.formals[i].name, frame.actuals[i + 1]});
    e.outputFrom = outputCount() + 1;
    result_.expansions.push_back(std::move(e));

    const bool equ = !f.label.empty() && def.labelFormal.empty();
    frames_.push_back(std::move(frame));
    emitGenerated("." + std::string(line.content), LineKind::Call);
    if (equ) emitGenerated(std::string(f.label) + " EQU *", LineKind::Label);
  }

  // The actual list #0..#n of a call (spec 4.2). #0 is the call's label when the prototype
  // has a label formal. IDENT=value goes to formal IDENT, any other actual is positional,
  // and a formal left without a value takes its default, or "". An actual in error is
  // ignored and the call is still expanded.
  std::vector<std::string> bindActuals(const MacroDefinition& def, const Fields& f, const Line& line) {
    const std::size_t n = def.formals.size();
    std::vector<std::optional<std::string>> given(n + 1);  // [0] unused: #0 is never an operand
    auto problem = [&](const Token& item, const std::string& message) {
      error(rangeAt(line, f.operandsOffset + item.offset, item.text.size()), message);
    };
    std::size_t positional = 0;
    bool tooMany = false;
    for (const Token& item : splitList(f.operands)) {
      const std::size_t eq = item.text.find('=');
      const std::string_view keyword =
          eq == std::string_view::npos ? std::string_view{} : trim(item.text.substr(0, eq));
      std::size_t index = 0;
      std::string_view value = item.text;
      if (isIdentifier(keyword)) {
        index = formalIndex(def, keyword);
        value = trim(item.text.substr(eq + 1));
        if (index == 0) {
          problem(item, "Unknown keyword '" + std::string(keyword) + "' for " + def.name);
          continue;
        }
      } else if (++positional > n) {
        if (!tooMany) problem(item, "Too many arguments for " + def.name + " (expects " + std::to_string(n) + ")");
        tooMany = true;
        continue;
      } else {
        index = positional;
      }
      if (given[index]) {
        problem(item, "Argument '" + def.formals[index - 1].name + "' given twice");
        continue;
      }
      given[index] = std::string(value);
    }

    std::vector<std::string> actuals(n + 1);
    if (!def.labelFormal.empty()) actuals[0] = std::string(f.label);
    for (std::size_t i = 1; i <= n; ++i)
      actuals[i] = given[i] ? *given[i] : def.formals[i - 1].defaultValue.value_or("");
    return actuals;
  }

  // Reads from the expansion stack until it is empty (spec 4.4). A stored body is the
  // prototype, the body lines and MCEND; reading MCEND ends the expansion. Every other
  // line goes through process(), which can push frames and add definitions, so no
  // reference into frames_ or bodies_ is kept across it. A line headed for the output
  // (d = 0) has its .SER replaced; a line stored in a definition keeps it.
  void expand() {
    while (!frames_.empty()) {
      Frame& top = frames_.back();
      const std::vector<PieceLine>& body = bodies_[static_cast<std::size_t>(top.definition)];
      const std::size_t at = top.next++;
      if (at == 0) continue;  // the prototype
      if (at + 1 >= body.size()) {
        result_.expansions[top.expansion].outputTo = outputCount();
        frames_.pop_back();
        continue;
      }
      const PieceLine pieces = substitute(body[at], top.actuals);
      const std::string text = d() == 0 ? outputText(pieces, top.serial) : displayForm(pieces, true);
      process({text, text, 0, &pieces});
    }
  }

  // A limit was reached (spec 4.4): the error goes to the outermost call and processing
  // ends. The open expansions end with the output produced so far.
  void stop(SourceRange at, std::string message) {
    error(at, std::move(message));
    for (const Frame& frame : frames_) result_.expansions[frame.expansion].outputTo = outputCount();
    frames_.clear();
    stopped_ = true;
  }

  int outputCount() const { return static_cast<int>(result_.lineMap.size()); }

  void emit(std::string_view text, LineKind kind, int source, int serial) {
    if (!result_.lineMap.empty()) result_.text += '\n';
    result_.text += text;
    result_.lineMap.push_back({outputCount() + 1, source, kind, serial});
  }

  // A line made by the top expansion maps to the outermost call and ends like that call
  // line. The output limit is checked here, so a source copied as is is never cut.
  void emitGenerated(std::string text, LineKind kind) {
    if (stopped_) return;
    const Frame& top = frames_.back();
    if (outputCount() >= options_.maxOutputLines) {
      stop(top.call, "Macro output too long (limit " + std::to_string(options_.maxOutputLines) + " lines)");
      return;
    }
    if (top.crlf) text += '\r';
    emit(text, kind, top.call.line, top.serial);
  }

  void copy(std::string_view raw, int lineNo) { emit(raw, LineKind::Verbatim, lineNo, 0); }

  const MacroProcessorOptions& options_;
  MacroResult& result_;
  Diagnostics diags_;
  std::vector<SourceRange> levels_;    // one per open MCDEFN: d = levels_.size()
  std::vector<FormalEntry> formals_;   // formal-parameter stack
  bool awaitingPrototype_ = false;     // the next line with content is a prototype
  DefinitionInProgress current_;
  std::vector<std::vector<PieceLine>> bodies_;  // stored bodies, parallel to result_.definitions;
                                                // expansion reads these, not displayBody
  std::vector<Frame> frames_;          // expansion stack: e = !frames_.empty()
  int serial_ = 0;                     // serial of the last expansion
  bool stopped_ = false;               // a limit ended the processing
};

}  // namespace

MacroProcessor::MacroProcessor(MacroProcessorOptions options) : options_(std::move(options)) {
  if (!options_.isOperation) {
    options_.isOperation = [](std::string_view upper) {
      return findInstruction(upper) != nullptr || findDirective(upper).has_value();
    };
  }
}

MacroResult MacroProcessor::process(std::string_view source) const {
  MacroResult result;
  OnePass pass(options_, result);
  int lineNo = 0;
  std::size_t pos = 0;
  for (;;) {
    const std::size_t nl = source.find('\n', pos);
    pass.read(source.substr(pos, nl == std::string_view::npos ? nl : nl - pos), ++lineNo);
    if (nl == std::string_view::npos) break;
    pos = nl + 1;
  }
  pass.finish();
  return result;
}

}  // namespace sicxe
