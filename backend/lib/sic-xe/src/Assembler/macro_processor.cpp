#include "assembler/macro_processor.hpp"

#include <algorithm>
#include <cctype>
#include <utility>

#include "assembler/isa.hpp"

namespace sicxe {
namespace {

// ---- text helpers (same field and comment rules as parser.cpp) -------------

std::string toUpper(std::string_view s) {
  std::string r(s);
  for (char& c : r) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  return r;
}

bool isSpace(char c) { return std::isspace(static_cast<unsigned char>(c)) != 0; }
bool isWordChar(char c) { return std::isalnum(static_cast<unsigned char>(c)) != 0 || c == '_'; }
bool isIdentifierStart(char c) { return std::isalpha(static_cast<unsigned char>(c)) != 0 || c == '_'; }

bool isIdentifier(std::string_view s) {
  if (s.empty() || !isIdentifierStart(s[0])) return false;
  for (char c : s)
    if (!isWordChar(c)) return false;
  return true;
}

std::string_view trim(std::string_view s) {
  while (!s.empty() && isSpace(s.front())) s.remove_prefix(1);
  while (!s.empty() && isSpace(s.back())) s.remove_suffix(1);
  return s;
}

std::string_view withoutCr(std::string_view line) {
  if (!line.empty() && line.back() == '\r') line.remove_suffix(1);
  return line;
}

// '+' prefix and ",x" suffix removed, as the parser does before looking a mnemonic up.
std::string_view operationMnemonic(std::string_view op) {
  if (!op.empty() && op.front() == '+') op.remove_prefix(1);
  return op.substr(0, op.find(','));
}

// Code part of a line: a '.' in column 1 makes the whole line a comment, and ';'
// outside quotes starts one. Any apostrophe toggles the quoted state.
std::string_view codeOf(std::string_view line) {
  if (!line.empty() && line.front() == '.') return {};
  bool inQuote = false;
  for (std::size_t i = 0; i < line.size(); ++i) {
    if (line[i] == '\'') inQuote = !inQuote;
    else if (line[i] == ';' && !inQuote) return line.substr(0, i);
  }
  return line;
}

struct Token {
  std::string_view text;
  std::size_t offset = 0;
};

// Next whitespace-delimited token from pos; empty text at the end.
Token nextToken(std::string_view s, std::size_t& pos) {
  while (pos < s.size() && isSpace(s[pos])) ++pos;
  const std::size_t start = pos;
  while (pos < s.size() && !isSpace(s[pos])) ++pos;
  return {s.substr(start, pos - start), start};
}

// Comma-separated items outside quotes, each trimmed; an empty list has none.
std::vector<Token> splitList(std::string_view list) {
  std::vector<Token> items;
  if (list.empty()) return items;
  auto add = [&](std::size_t begin, std::size_t end) {
    while (begin < end && isSpace(list[begin])) ++begin;
    items.push_back({trim(list.substr(begin, end - begin)), begin});
  };
  bool inQuote = false;
  std::size_t start = 0;
  for (std::size_t i = 0; i < list.size(); ++i) {
    if (list[i] == '\'') inQuote = !inQuote;
    else if (list[i] == ',' && !inQuote) { add(start, i); start = i + 1; }
  }
  add(start, list.size());
  return items;
}

// ---- stored body ------------------------------------------------------------

// A stored body line is a sequence of pieces, never text with '#' markers, so a
// user-written "#1" cannot be mistaken for a parameter (Review Focus 1).
// Param levels count from the definition that stores the line (1); expanding it
// turns Param{1,i} into actual i and Param{k,i} into Param{k-1,i}.
struct Piece {
  enum class Kind { Text, Param, Serial };
  Kind kind = Kind::Text;
  std::string text;  // Text
  int level = 0;     // Param
  int index = 0;     // Param: 0 = label formal, 1..n = formals
};
using PieceLine = std::vector<Piece>;

PieceLine textLine(std::string_view text) { return {{Piece::Kind::Text, std::string(text)}}; }

// Display form of a marker (spec 4.4): "#i", or "#(d,i)" in a definition with nested definitions.
std::string markerText(const Piece& param, bool nested) {
  return nested ? "#(" + std::to_string(param.level) + "," + std::to_string(param.index) + ")"
                : "#" + std::to_string(param.index);
}

std::string displayForm(const PieceLine& line, bool nested) {
  std::string out;
  for (const Piece& p : line) {
    switch (p.kind) {
      case Piece::Kind::Text: out += p.text; break;
      case Piece::Kind::Param: out += markerText(p, nested); break;
      case Piece::Kind::Serial: out += ".SER"; break;
    }
  }
  return out;
}

// A stored line read from an expansion (spec 4.4): Param{1,i} becomes actual i. Serial
// stays, because it is replaced only when the line goes to the output.
PieceLine substitute(const PieceLine& line, const std::vector<std::string>& actuals) {
  PieceLine out;
  for (const Piece& p : line) {
    if (p.kind == Piece::Kind::Param && p.level == 1)
      out.push_back({Piece::Kind::Text, actuals[static_cast<std::size_t>(p.index)]});
    else
      out.push_back(p);
  }
  return out;
}

// .SER value: the serial in at least three digits (HEAD.SER -> HEAD017).
std::string serialText(int serial) {
  std::string digits = std::to_string(serial);
  if (digits.size() < 3) digits.insert(0, 3 - digits.size(), '0');
  return digits;
}

// An expanded line as it goes to the output. A marker can only be left inside a nested
// definition, and it keeps its display form.
std::string outputText(const PieceLine& line, int serial) {
  std::string out;
  for (const Piece& p : line) {
    switch (p.kind) {
      case Piece::Kind::Text: out += p.text; break;
      case Piece::Kind::Param: out += markerText(p, true); break;
      case Piece::Kind::Serial: out += serialText(serial); break;
    }
  }
  return out;
}

// Finds the formal a word refers to; `offset` is the word's position in the line.
using FormalLookup = std::function<std::optional<Piece>(std::string_view word, std::size_t offset)>;

// Identifier tokens outside quotes and comments become Param when `lookup` finds them,
// except right after '$' (a register) and the C/X of a C'..' / X'..' literal.
// ".NAME" of a formal drops the dot; ".SER" is the system formal.
PieceLine toPieces(std::string_view line, const FormalLookup& lookup) {
  PieceLine out;
  std::string text;
  auto flushText = [&] {
    if (!text.empty()) out.push_back({Piece::Kind::Text, std::move(text)});
    text.clear();
  };
  auto wordEnd = [&](std::size_t i, std::size_t end) {
    while (i < end && isWordChar(line[i])) ++i;
    return i;
  };
  const std::size_t codeEnd = codeOf(line).size();
  bool inQuote = false;
  std::size_t i = 0;
  while (i < codeEnd) {
    const char c = line[i];
    if (c == '\'') inQuote = !inQuote;
    if (inQuote || c == '\'' || (!isWordChar(c) && c != '.')) {
      text += c;
      ++i;
      continue;
    }
    if (c == '.') {
      if (i + 1 >= codeEnd || !isIdentifierStart(line[i + 1])) {
        text += c;
        ++i;
        continue;
      }
      const std::size_t end = wordEnd(i + 1, codeEnd);
      const std::string_view word = line.substr(i + 1, end - i - 1);
      if (toUpper(word) == "SER") {
        flushText();
        out.push_back({Piece::Kind::Serial, {}, 0, 0});
      } else if (auto param = lookup(word, i + 1)) {
        flushText();
        out.push_back(*param);
      } else {
        text += line.substr(i, end - i);
      }
      i = end;
      continue;
    }
    const std::size_t end = wordEnd(i, codeEnd);
    const std::string_view word = line.substr(i, end - i);
    const char first = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    const bool literalPrefix = word.size() == 1 && (first == 'C' || first == 'X') &&
                               end < codeEnd && line[end] == '\'';
    const bool registerName = i > 0 && line[i - 1] == '$';
    std::optional<Piece> param;
    if (isIdentifierStart(c) && !literalPrefix && !registerName) param = lookup(word, i);
    if (param) {
      flushText();
      out.push_back(*param);
    } else {
      text += word;
    }
    i = end;
  }
  text += line.substr(codeEnd);  // the comment, as written
  flushText();
  return out;
}

// ---- prototype ----------------------------------------------------------------

struct PrototypeFormal {
  std::string name;
  std::size_t offset = 0;
  std::optional<std::string> defaultValue;
};

struct Prototype {
  std::string label;  // "" = no label formal
  std::size_t labelOffset = 0;
  std::string name;
  std::size_t nameOffset = 0;
  std::vector<PrototypeFormal> formals;
};

// Spec 4.1 structural rule, independent of columns. `code` has its comment removed.
Prototype parsePrototype(std::string_view code) {
  Prototype p;
  std::size_t pos = 0;
  const Token t1 = nextToken(code, pos);
  const Token t2 = nextToken(code, pos);
  const Token afterT2 = nextToken(code, pos);
  std::size_t formalsAt = t2.offset;
  p.name = std::string(t1.text);
  p.nameOffset = t1.offset;
  if (!t2.text.empty() && t2.text.find_first_of(",=") == std::string_view::npos &&
      !afterT2.text.empty() && afterT2.text.front() != ',') {
    p.label = std::string(t1.text);
    p.labelOffset = t1.offset;
    p.name = std::string(t2.text);
    p.nameOffset = t2.offset;
    formalsAt = afterT2.offset;
  }
  if (t2.text.empty()) return p;

  // Formals: "X" is positional, "X=" / "X=default" a keyword.
  for (const Token& item : splitList(code.substr(formalsAt))) {
    PrototypeFormal f;
    f.offset = formalsAt + item.offset;
    const std::size_t eq = item.text.find('=');
    f.name = std::string(trim(item.text.substr(0, eq)));
    if (eq != std::string_view::npos) f.defaultValue = std::string(trim(item.text.substr(eq + 1)));
    p.formals.push_back(std::move(f));
  }
  return p;
}

// ---- the one-pass algorithm (spec 4.4) ------------------------------------------

struct FormalEntry {
  std::string upper;
  int level = 0;
  int index = 0;
};

// Where an open MCDEFN was written, for the errors that point back at it.
struct OpenLevel {
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
  int originLine = 0;
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
  int sourceLine = 0;                // the outermost call's source line
  bool crlf = false;                 // generated lines end in '\r' when that call line did
  std::size_t expansion = 0;         // its entry in result.expansions
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

  void read(std::string_view raw, int lineNo) {
    const std::string_view content = withoutCr(raw);
    const std::string_view code = codeOf(content);
    const Fields f = fields(code);
    const std::string keyword = toUpper(operationMnemonic(f.op));
    const bool isDefn = keyword == "MCDEFN";
    const bool isEnd = keyword == "MCEND";

    if (awaitingPrototype_ && !isDefn && !isEnd) {
      // Comments and blank lines before the prototype do not count as one.
      if (trim(code).empty()) {
        if (d() > 1) store(textLine(content), lineNo);
      } else {
        prototype(content, code, lineNo);
      }
      return;
    }
    if (awaitingPrototype_) missingPrototype();

    if (isDefn) defineStart(f, content, lineNo);
    else if (isEnd) defineEnd(f, content, lineNo);
    else if (d() > 0) store(bodyLine(content), lineNo);
    else if (const int slot = nameSlot(toUpper(f.op)); slot >= 0)
      call(f, content, raw.size() != content.size(), lineNo, slot);
    else copy(raw, lineNo);
  }

  void finish() {
    if (awaitingPrototype_) missingPrototype();
    for (const OpenLevel& open : levels_)
      diags_.error(open.line, open.column, "MCDEFN without MCEND", open.length);
    result_.diagnostics = diags_.sorted();
  }

 private:
  int d() const { return static_cast<int>(levels_.size()); }

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

  void keywordAlone(const Fields& f, const char* keyword, int lineNo) {
    const std::string message = std::string(keyword) + " takes no label or operands";
    if (!f.label.empty())
      diags_.error(lineNo, static_cast<int>(f.labelOffset) + 1, message, static_cast<int>(f.label.size()));
    else if (!f.operands.empty())
      diags_.error(lineNo, static_cast<int>(f.operandsOffset) + 1, message,
                   static_cast<int>(f.operands.size()));
  }

  void defineStart(const Fields& f, std::string_view content, int lineNo) {
    result_.hasMacros = true;
    keywordAlone(f, "MCDEFN", lineNo);
    levels_.push_back({lineNo, static_cast<int>(f.opOffset) + 1, static_cast<int>(f.op.size())});
    if (d() == 1) {
      current_ = {};
      current_.originLine = lineNo;
    } else {
      current_.hasNested = true;
      store(textLine(content), lineNo);
    }
    awaitingPrototype_ = true;
  }

  void defineEnd(const Fields& f, std::string_view content, int lineNo) {
    keywordAlone(f, "MCEND", lineNo);
    if (d() == 0) {
      diags_.error(lineNo, static_cast<int>(f.opOffset) + 1, "MCEND without MCDEFN",
                   static_cast<int>(f.op.size()));
      return;
    }
    while (!formals_.empty() && formals_.back().level == d()) formals_.pop_back();
    store(textLine(content), lineNo);
    levels_.pop_back();
    if (d() == 0) closeDefinition();
  }

  void missingPrototype() {
    awaitingPrototype_ = false;
    const OpenLevel& open = levels_.back();
    diags_.error(open.line, open.column, "Missing prototype after MCDEFN", open.length);
    if (d() == 1) current_.failed = true;
  }

  // Formals of level d() are pushed before the line is stored. At level 1 the line is
  // the new definition's prototype; deeper, it is a body line whose own formal names
  // stay as written while names of enclosing levels become markers (Figure 4.10).
  void prototype(std::string_view content, std::string_view code, int lineNo) {
    awaitingPrototype_ = false;
    Prototype p = parsePrototype(code);
    std::vector<std::size_t> ownNames;
    if (!p.label.empty()) ownNames.push_back(p.labelOffset);
    for (const PrototypeFormal& f : p.formals) ownNames.push_back(f.offset);

    const bool usable = checkPrototype(p, lineNo, d() == 1);
    if (!p.label.empty()) formals_.push_back({toUpper(p.label), d(), 0});
    for (std::size_t i = 0; i < p.formals.size(); ++i)
      formals_.push_back({toUpper(p.formals[i].name), d(), static_cast<int>(i) + 1});

    if (d() > 1) {
      auto enclosingFormal = [&](std::string_view word, std::size_t offset) -> std::optional<Piece> {
        if (std::find(ownNames.begin(), ownNames.end(), offset) != ownNames.end()) return std::nullopt;
        return findFormal(word, d() - 1);
      };
      store(toPieces(content, enclosingFormal), lineNo);
      return;
    }
    current_.failed = current_.failed || !usable;
    current_.name = toUpper(p.name);
    current_.prototype = std::string(trim(code));
    current_.labelFormal = p.label;
    for (const PrototypeFormal& f : p.formals) current_.formals.push_back({f.name, f.defaultValue});
    current_.prototypeLine = lineNo;
    store(textLine(content), lineNo);
  }

  // Drops invalid and repeated formals (reporting them when `report`), so indices
  // match the formal list. Returns false when the name cannot be a macro name.
  bool checkPrototype(Prototype& p, int lineNo, bool report) {
    auto problem = [&](std::size_t offset, std::size_t length, const std::string& message) {
      if (report)
        diags_.error(lineNo, static_cast<int>(offset) + 1, message,
                     static_cast<int>(std::max<std::size_t>(length, 1)));
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

  void store(PieceLine line, int lineNo) {
    current_.lines.push_back(std::move(line));
    current_.sourceLines.push_back(lineNo);
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

  // A call in the source (spec 4.2, 4.5): the call as a '.' comment, then "LABEL EQU *"
  // when the call has a label and the prototype has no label formal, then the body,
  // read from a new frame on the expansion stack.
  void call(const Fields& f, std::string_view content, bool crlf, int lineNo, int slot) {
    const MacroName& name = result_.names[static_cast<std::size_t>(slot)];
    const MacroDefinition& def = result_.definitions[static_cast<std::size_t>(name.definition)];
    Frame frame;
    frame.definition = def.index;
    frame.actuals = bindActuals(def, f, lineNo);
    frame.serial = ++serial_;
    frame.sourceLine = lineNo;
    frame.crlf = crlf;
    frame.expansion = result_.expansions.size();

    Expansion e;
    e.serial = frame.serial;
    e.macro = def.name;
    e.definition = def.index;
    e.depth = 1;  // a call in the source is top level: parent 0
    e.callLine = lineNo;
    e.callText = std::string(content);
    if (!def.labelFormal.empty()) e.actuals.push_back({0, def.labelFormal, frame.actuals[0]});
    for (std::size_t i = 0; i < def.formals.size(); ++i)
      e.actuals.push_back({static_cast<int>(i) + 1, def.formals[i].name, frame.actuals[i + 1]});
    e.outputFrom = outputCount() + 1;
    result_.expansions.push_back(std::move(e));

    emitGenerated("." + std::string(content), LineKind::Call, frame);
    if (!f.label.empty() && def.labelFormal.empty())
      emitGenerated(std::string(f.label) + " EQU *", LineKind::Label, frame);
    frames_.push_back(std::move(frame));
    expand();
  }

  // The actual list #0..#n of a call (spec 4.2). #0 is the call's label when the prototype
  // has a label formal. IDENT=value goes to formal IDENT, any other actual is positional,
  // and a formal left without a value takes its default, or "". An actual in error is
  // ignored and the call is still expanded.
  std::vector<std::string> bindActuals(const MacroDefinition& def, const Fields& f, int lineNo) {
    const std::size_t n = def.formals.size();
    std::vector<std::optional<std::string>> given(n + 1);  // [0] unused: #0 is never an operand
    auto problem = [&](const Token& item, const std::string& message) {
      diags_.error(lineNo, static_cast<int>(f.operandsOffset + item.offset) + 1, message,
                   static_cast<int>(std::max<std::size_t>(item.text.size(), 1)));
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
  // prototype, the body lines and MCEND; reading MCEND ends the expansion.
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
      emitGenerated(outputText(substitute(body[at], top.actuals), top.serial), LineKind::Expanded, top);
    }
  }

  int outputCount() const { return static_cast<int>(result_.lineMap.size()); }

  void emit(std::string_view text, LineKind kind, int source, int serial) {
    if (!result_.lineMap.empty()) result_.text += '\n';
    result_.text += text;
    result_.lineMap.push_back({outputCount() + 1, source, kind, serial});
  }

  // A line made by an expansion maps to the outermost call and ends like that call line.
  void emitGenerated(std::string text, LineKind kind, const Frame& frame) {
    if (frame.crlf) text += '\r';
    emit(text, kind, frame.sourceLine, frame.serial);
  }

  void copy(std::string_view raw, int lineNo) { emit(raw, LineKind::Verbatim, lineNo, 0); }

  const MacroProcessorOptions& options_;
  MacroResult& result_;
  Diagnostics diags_;
  std::vector<OpenLevel> levels_;      // one per open MCDEFN: d = levels_.size()
  std::vector<FormalEntry> formals_;   // formal-parameter stack
  bool awaitingPrototype_ = false;     // the next line with content is a prototype
  DefinitionInProgress current_;
  std::vector<std::vector<PieceLine>> bodies_;  // stored bodies, parallel to result_.definitions;
                                                // expansion reads these, not displayBody
  std::vector<Frame> frames_;          // expansion stack: e = !frames_.empty()
  int serial_ = 0;                     // serial of the last expansion
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
