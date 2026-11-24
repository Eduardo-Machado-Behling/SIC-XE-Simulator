#pragma once
// The details of the ProgramLinked event.

#include <cstddef>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "assembler/loader.hpp"

namespace sicxe {

// `objects` pairs each file with the text of its own .obj. Every string is valid UTF-8.
nlohmann::json linkReportJson(const LinkResult& linked, const LoadResult& loaded,
                              const std::vector<std::pair<std::string, std::string>>& objects,
                              std::size_t loadAddress);

}  // namespace sicxe
