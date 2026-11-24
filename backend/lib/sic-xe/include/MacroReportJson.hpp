#pragma once
// The details of the MacrosExpanded event (spec section 5).

#include <string>
#include <string_view>

#include <nlohmann/json.hpp>

#include "assembler/macro_processor.hpp"

namespace sicxe {

// r as the JSON the editor reads: MASMAPRG.ASM, the tables, the line map and the
// trace. A 0 that means "none" becomes null (parent, source, serial, body line,
// trace target), and so do an empty label formal and a formal without a default.
// Every string is valid UTF-8: an ill-formed byte sequence of the source becomes U+FFFD.
nlohmann::json macroReportJson(const MacroResult& r);

// s with each ill-formed UTF-8 sequence replaced by U+FFFD (what macroReportJson does to every string).
std::string validUtf8(std::string_view s);

}  // namespace sicxe
