// Mapping of assembler diagnostics from MASMAPRG.ASM back to the macro source (spec 5).

#include <charconv>
#include <string>
#include <system_error>
#include <utility>

#include "assembler/macro_processor.hpp"
#include "macro_text.hpp"

namespace sicxe {

using namespace macro_text;

// ---- assembler diagnostics back to the source (spec 5) ------------------------------

namespace {


// The lineMap entry of a MASMAPRG.ASM line, null past the end.
const LineOrigin* originOf(const MacroResult& r, int outputLine) {
  if (outputLine < 1 || static_cast<std::size_t>(outputLine) > r.lineMap.size()) return nullptr;
  return &r.lineMap[static_cast<std::size_t>(outputLine) - 1];
}

// result.expansions is in serial order, from 1.
const Expansion* expansionOf(const MacroResult& r, int serial) {
  if (serial < 1 || static_cast<std::size_t>(serial) > r.expansions.size()) return nullptr;
  return &r.expansions[static_cast<std::size_t>(serial) - 1];
}

// Line `number` (1-based) of `text`, without its '\r'.
std::string_view lineOf(std::string_view text, int number) {
  std::size_t pos = 0;
  for (int i = 1; i < number; ++i) {
    const std::size_t nl = text.find('\n', pos);
    if (nl == std::string_view::npos) return {};
    pos = nl + 1;
  }
  const std::size_t nl = text.find('\n', pos);
  return withoutCr(text.substr(pos, nl == std::string_view::npos ? nl : nl - pos));
}

// The macro name on a call line of the source: the operation field, which is the first
// token unless that one is the label (spec 4.2).
SourceSpan callName(std::string_view source, int line, const std::string& macro) {
  const std::string_view code = codeOf(lineOf(source, line));
  std::size_t pos = 0;
  for (int field = 0; field < 2; ++field) {
    const Token t = nextToken(code, pos);
    if (!t.text.empty() && toUpper(t.text) == macro)
      return {line, static_cast<int>(t.offset) + 1, static_cast<int>(t.text.size()), true};
  }
  return {line, 0, 1, true};
}

// The N of "(first defined on line N)" becomes the line of the source.
std::string withSourceLine(const MacroResult& r, std::string message) {
  static constexpr std::string_view kFirstDefined = "(first defined on line ";
  const std::size_t at = message.find(kFirstDefined);
  if (at == std::string::npos) return message;
  const std::size_t from = at + kFirstDefined.size();
  int line = 0;
  const auto [end, ec] = std::from_chars(message.data() + from, message.data() + message.size(), line);
  const LineOrigin* origin = ec == std::errc{} ? originOf(r, line) : nullptr;
  if (!origin) return message;
  const auto digits = static_cast<std::size_t>(end - (message.data() + from));
  return message.replace(from, digits, std::to_string(origin->source));
}

// "In expansion of NAME (#001, MASMAPRG.ASM:12): ", naming the innermost expansion: the
// one that emitted the line. Empty when the line is not in the output.
std::string expansionPrefix(const MacroResult& r, int outputLine) {
  const LineOrigin* origin = originOf(r, outputLine);
  if (!origin) return {};
  const int serial = origin->serial;
  const Expansion* e = expansionOf(r, serial);
  return "In expansion of " + (e ? e->macro : std::string()) + " (#" + serialText(serial) + ", " +
         std::string(kMacroOutputFile) + ":" + std::to_string(outputLine) + "): ";
}

}  // namespace

// A line past r.text is left as is. An expansion line goes to the macro name of the
// outermost call, the only part of it written in the source.
SourceSpan mapToSource(const MacroResult& r, std::string_view source, int outputLine, int outputColumn,
                       int length) {
  const LineOrigin* origin = originOf(r, outputLine);
  if (!origin) return {outputLine, outputColumn, length, false};
  if (origin->kind == LineKind::Verbatim) return {origin->source, outputColumn, length, false};
  const Expansion* outermost = expansionOf(r, origin->serial);
  while (outermost && outermost->parent != 0) outermost = expansionOf(r, outermost->parent);
  if (!outermost) return {origin->source, 0, 1, true};
  return callName(source, origin->source, outermost->macro);
}

// The order is kept: lineMap never goes back in the source.
std::vector<Diagnostic> remapAssemblyDiagnostics(const MacroResult& r, std::string_view source,
                                                 const std::vector<Diagnostic>& assembled) {
  std::vector<Diagnostic> mapped;
  mapped.reserve(assembled.size());
  for (Diagnostic d : assembled) {
    const SourceSpan at = mapToSource(r, source, d.line, d.column, d.length);
    if (d.message != "Missing END directive") {   // the language server matches it exactly
      d.message = withSourceLine(r, std::move(d.message));
      if (at.synthetic) d.message = expansionPrefix(r, d.line) + d.message;
    }
    d.line = at.line;
    d.column = at.column;
    d.length = at.length;
    mapped.push_back(std::move(d));
  }
  return mapped;
}

}  // namespace sicxe
