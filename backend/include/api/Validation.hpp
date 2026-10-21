#pragma once

#include <array>
#include <string>
#include <string_view>
#include <vector>

#include "pch/JSON.hpp"
#include "session/SessionStore.hpp"

// Request validation for the documented HTTP API (api_spec/openapi.yaml).
// Every `parse_*` function throws api::ApiError (400 invalid-request) with a
// `detail` naming the offending field.
namespace api {

// Values of the `Architecture` enum.
inline constexpr std::array<std::string_view, 2> kArchitectures = {"SIC", "SIC-XE"};

bool is_architecture(std::string_view value);

// `format: uuid`: the 8-4-4-4-12 hexadecimal form, case-insensitive.
bool is_uuid(std::string_view value);

// `FilePath`: minLength 1 and pattern '^[^/].*$' with JSON Schema (ECMAScript,
// unicode) semantics: the first character is not '/', and no later character
// is a line terminator (\n, \r, U+2028, U+2029), since '.' does not match
// those. The value must also be valid UTF-8.
bool is_file_path(std::string_view value);

// Parses a JSON request body; an empty or malformed body is a 400.
nlohmann::json parse_body(const std::string& body);

// `ProjectInput` (name, architecture, files). `where` prefixes error details,
// e.g. "[2]." for the third item of a sync request.
session::StoredProject parse_project_input(const nlohmann::json& value,
                                           const std::string& where = "");

// Array of `ProjectSyncItem` (ProjectInput + id). IDs must be unique.
std::vector<session::StoredProject> parse_project_sync(const nlohmann::json& value);

struct FileSync {
    std::string path;
    std::string content;
};

// `FileSync` (path, content).
FileSync parse_file_sync(const nlohmann::json& value);

} // namespace api
