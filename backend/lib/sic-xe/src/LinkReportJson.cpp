// LinkResult and LoadResult as the details of the ProgramLinked event.
#include "LinkReportJson.hpp"

#include <cstdio>

#include "MacroReportJson.hpp"
#include "assembler/object_text.hpp"

namespace sicxe {

namespace {

using nlohmann::json;

std::string hex6(std::size_t value) {
  char buf[32];
  std::snprintf(buf, sizeof buf, "%06zX", value);
  return buf;
}

}  // namespace

json linkReportJson(const LinkResult& linked, const LoadResult& loaded,
                    const std::vector<std::pair<std::string, std::string>>& objects, std::size_t loadAddress) {
  json estab = json::array();
  for (const EstabEntry& e : linked.estab)
    estab.push_back({{"section", validUtf8(e.section)}, {"symbol", validUtf8(e.symbol)}, {"address", e.address},
                     {"length", e.length}, {"file", validUtf8(e.sourceFile)}});

  json objectTexts = json::array();
  for (const auto& [file, text] : objects)
    objectTexts.push_back({{"source", validUtf8(file)}, {"text", validUtf8(text)}});

  json out = {{"name", ""}, {"text", ""}, {"bands", json::array()}};
  if (!linked.linked.sections.empty()) {
    const RenderedText rendered = renderObjectText(linked.linked, linked.origins);
    json bands = json::array();
    for (const LineBand& band : rendered.bands)
      bands.push_back({{"firstLine", band.firstLine}, {"lastLine", band.lastLine}, {"label", validUtf8(band.label)}});
    out = {{"name", validUtf8(linked.linked.sections[0].name)}, {"text", validUtf8(rendered.text)}, {"bands", bands}};
  }

  json trace = json::array();
  for (const LinkStep& step : linked.trace)
    trace.push_back({{"pass", step.pass == LinkStep::Pass::One ? "1" : "2"}, {"text", validUtf8(step.text)},
                     {"file", validUtf8(step.file)}, {"line", step.line}, {"address", step.address},
                     {"before", step.before}, {"after", step.after}, {"symbol", validUtf8(step.symbol)}});
  for (const LoadStep& step : loaded.trace)
    trace.push_back({{"pass", "load"},
                     {"text", "field at " + hex6(step.address) + ": " + hex6(static_cast<std::size_t>(step.before)) + " -> " +
                                  hex6(static_cast<std::size_t>(step.after))},
                     {"file", ""}, {"line", 0}, {"address", step.address}, {"before", step.before},
                     {"after", step.after}, {"symbol", ""}});

  return {{"estab", estab}, {"objects", objectTexts}, {"out", out}, {"trace", trace}, {"loadAddress", loadAddress}};
}

}  // namespace sicxe
