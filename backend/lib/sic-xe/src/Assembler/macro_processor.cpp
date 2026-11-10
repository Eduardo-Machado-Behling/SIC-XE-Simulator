#include "assembler/macro_processor.hpp"

#include "assembler/isa.hpp"

namespace sicxe {

MacroProcessor::MacroProcessor(MacroProcessorOptions options) : options_(std::move(options)) {
  if (!options_.isOperation) {
    options_.isOperation = [](std::string_view upper) {
      return findInstruction(upper) != nullptr || findDirective(upper).has_value();
    };
  }
}

MacroResult MacroProcessor::process(std::string_view source) const {
  MacroResult result;
  int lineNo = 0;
  std::size_t pos = 0;
  for (;;) {
    const std::size_t nl = source.find('\n', pos);
    const std::string_view line =
        source.substr(pos, nl == std::string_view::npos ? nl : nl - pos);
    ++lineNo;
    if (lineNo > 1) result.text += '\n';
    result.text += line;
    result.lineMap.push_back({lineNo, lineNo, LineKind::Verbatim, 0});
    if (nl == std::string_view::npos) break;
    pos = nl + 1;
  }
  return result;
}

}  // namespace sicxe
