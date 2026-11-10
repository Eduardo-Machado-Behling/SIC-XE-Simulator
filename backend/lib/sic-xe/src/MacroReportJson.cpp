// MacroResult as the details of the MacrosExpanded event (spec section 5).
#include "MacroReportJson.hpp"

#include <cstddef>
#include <string>
#include <string_view>

namespace sicxe {

namespace {

using nlohmann::json;

constexpr char kOutputFile[] = "MASMAPRG.ASM";
constexpr char kReplacement[] = "\xEF\xBF\xBD";  // U+FFFD

// s with each ill-formed UTF-8 sequence replaced by U+FFFD, one per maximal subpart
// (Unicode 3.9, table 3-7). Source bytes are copied as they are, a Latin-1 comment
// included, and nlohmann's dump() throws on invalid UTF-8.
std::string utf8(std::string_view s) {
  std::string out;
  out.reserve(s.size());
  std::size_t i = 0;
  while (i < s.size()) {
    const auto lead = static_cast<unsigned char>(s[i]);
    if (lead < 0x80) {
      out += s[i++];
      continue;
    }
    std::size_t trail = 0;                  // continuation bytes the lead byte announces
    unsigned char low = 0x80, high = 0xBF;  // range of the first continuation byte
    if (lead >= 0xC2 && lead <= 0xDF) { trail = 1; }
    else if (lead == 0xE0) { trail = 2; low = 0xA0; }
    else if (lead == 0xED) { trail = 2; high = 0x9F; }  // no UTF-16 surrogates
    else if (lead >= 0xE1 && lead <= 0xEF) { trail = 2; }
    else if (lead == 0xF0) { trail = 3; low = 0x90; }
    else if (lead == 0xF4) { trail = 3; high = 0x8F; }  // nothing above U+10FFFF
    else if (lead >= 0xF1 && lead <= 0xF3) { trail = 3; }

    std::size_t n = 1;  // length of the well-formed prefix starting at i
    while (n <= trail && i + n < s.size()) {
      const auto c = static_cast<unsigned char>(s[i + n]);
      if (c < (n == 1 ? low : 0x80) || c > (n == 1 ? high : 0xBF)) break;
      ++n;
    }
    if (trail > 0 && n == trail + 1) out.append(s.substr(i, n));
    else out += kReplacement;
    i += n;
  }
  return out;
}

json orNull(int value) { return value == 0 ? json(nullptr) : json(value); }

const char* severityName(Severity severity) { return severity == Severity::Error ? "error" : "warning"; }

const char* kindName(LineKind kind) {
  switch (kind) {
    case LineKind::Verbatim: return "verbatim";
    case LineKind::Call: return "call";
    case LineKind::Label: return "label";
    case LineKind::Expanded: return "expanded";
  }
  return "verbatim";
}

const char* actionName(TraceAction action) {
  switch (action) {
    case TraceAction::Copy: return "copy";
    case TraceAction::DefineStart: return "define-start";
    case TraceAction::Prototype: return "prototype";
    case TraceAction::Store: return "store";
    case TraceAction::DefineEnd: return "define-end";
    case TraceAction::Call: return "call";
    case TraceAction::ReadPrototype: return "read-prototype";
    case TraceAction::ExpansionEnd: return "expansion-end";
    case TraceAction::Error: return "error";
  }
  return "error";
}

json diagnosticJson(const Diagnostic& d) {
  return {{"severity", severityName(d.severity)}, {"line", d.line}, {"column", d.column},
          {"length", d.length}, {"message", utf8(d.message)}};
}

json definitionJson(const MacroDefinition& d) {
  json formals = json::array();
  for (const Formal& f : d.formals) {
    const json defaultValue = f.defaultValue ? json(utf8(*f.defaultValue)) : json(nullptr);
    formals.push_back({{"name", utf8(f.name)}, {"default", defaultValue}});
  }

  json body = json::array();
  for (std::size_t i = 0; i < d.displayBody.size(); ++i) {
    const int line = i < d.bodySourceLines.size() ? d.bodySourceLines[i] : 0;
    body.push_back({{"text", utf8(d.displayBody[i])}, {"line", orNull(line)}});
  }

  const json origin = d.originSourceLine > 0 ? json{{"kind", "source"}, {"line", d.originSourceLine}}
                                             : json{{"kind", "expansion"}, {"serial", d.originSerial}};
  return {{"index", d.index},
          {"name", utf8(d.name)},
          {"prototype", utf8(d.prototype)},
          {"labelFormal", d.labelFormal.empty() ? json(nullptr) : json(utf8(d.labelFormal))},
          {"formals", std::move(formals)},
          {"active", d.active},
          {"origin", origin},
          {"body", std::move(body)}};
}

json expansionJson(const Expansion& e) {
  json actuals = json::array();
  for (const Actual& a : e.actuals)
    actuals.push_back({{"index", a.index}, {"formal", utf8(a.formal)}, {"value", utf8(a.value)}});
  return {{"serial", e.serial},
          {"macro", utf8(e.macro)},
          {"definition", e.definition},
          {"parent", orNull(e.parent)},
          {"depth", e.depth},
          {"callLine", e.callLine},
          {"callText", utf8(e.callText)},
          {"actuals", std::move(actuals)},
          {"output", {{"from", e.outputFrom}, {"to", e.outputTo}}}};
}

// Copy -> the output line; Prototype, Store, DefineEnd -> the definition body line, only
// when the line entered a definition (index 0 is a real definition, so bodyLine decides);
// Call -> the new expansion. Every other action has no target.
json targetJson(const TraceStep& s) {
  switch (s.action) {
    case TraceAction::Copy:
      return {{"output", s.targetOutput}};
    case TraceAction::Prototype:
    case TraceAction::Store:
    case TraceAction::DefineEnd:
      if (s.targetBodyLine > 0) return {{"definition", s.targetDefinition}, {"bodyLine", s.targetBodyLine}};
      return nullptr;
    case TraceAction::Call:
      return {{"serial", s.targetSerial}};
    default:
      return nullptr;
  }
}

json stepJson(const TraceStep& s) {
  const json read = s.fromExpansion ? json{{"from", "expansion"}, {"serial", s.serial}, {"bodyLine", s.line}}
                                    : json{{"from", "source"}, {"line", s.line}};
  return {{"step", s.step},
          {"read", read},
          {"d", s.d},
          {"e", s.e},
          {"depth", s.depth},
          {"text", utf8(s.text)},
          {"action", actionName(s.action)},
          {"target", targetJson(s)}};
}

}  // namespace

json macroReportJson(const MacroResult& r) {
  json diagnostics = json::array();
  for (const Diagnostic& d : r.diagnostics) diagnostics.push_back(diagnosticJson(d));

  json names = json::array();
  for (const MacroName& n : r.names)
    names.push_back({{"name", utf8(n.name)}, {"definition", n.definition}, {"line", n.line}});

  json definitions = json::array();
  for (const MacroDefinition& d : r.definitions) definitions.push_back(definitionJson(d));

  json expansions = json::array();
  for (const Expansion& e : r.expansions) expansions.push_back(expansionJson(e));

  json lineMap = json::array();
  for (const LineOrigin& o : r.lineMap)
    lineMap.push_back({{"output", o.output}, {"source", orNull(o.source)}, {"kind", kindName(o.kind)},
                       {"serial", orNull(o.serial)}});

  json steps = json::array();
  for (const TraceStep& s : r.trace.steps) steps.push_back(stepJson(s));

  return {{"file", kOutputFile},
          {"ok", r.ok()},
          {"hasMacros", r.hasMacros},
          {"text", utf8(r.text)},
          {"diagnostics", std::move(diagnostics)},
          {"names", std::move(names)},
          {"definitions", std::move(definitions)},
          {"expansions", std::move(expansions)},
          {"lineMap", std::move(lineMap)},
          {"trace", {{"truncated", r.trace.truncated}, {"steps", std::move(steps)}}}};
}

}  // namespace sicxe
