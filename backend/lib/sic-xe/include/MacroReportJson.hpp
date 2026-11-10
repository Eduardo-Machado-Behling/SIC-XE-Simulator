#pragma once
// The details of the MacrosExpanded event (spec section 5).

#include <nlohmann/json.hpp>

#include "assembler/macro_processor.hpp"

namespace sicxe {

// r as the JSON the editor reads: MASMAPRG.ASM, the tables, the line map and the
// trace. A 0 that means "none" becomes null (parent, source, serial, body line,
// trace target), and so do an empty label formal and a formal without a default.
// Every string is valid UTF-8: an ill-formed byte sequence of the source becomes U+FFFD.
nlohmann::json macroReportJson(const MacroResult& r);

}  // namespace sicxe
