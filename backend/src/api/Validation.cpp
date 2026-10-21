#include "api/Validation.hpp"

#include <algorithm>
#include <cstdint>
#include <unordered_set>

#include "api/ApiError.hpp"

using json = nlohmann::json;

namespace api {

namespace {

// Length in bytes of the UTF-8 sequence at the start of `s`, or 0 when it is
// not a well-formed sequence (overlongs, surrogates and > U+10FFFF rejected).
std::size_t utf8_sequence_length(std::string_view s) {
    const auto byte = [&](std::size_t i) { return static_cast<std::uint8_t>(s[i]); };
    const auto continuation = [&](std::size_t i) { return i < s.size() && (byte(i) & 0xC0) == 0x80; };

    const std::uint8_t b0 = byte(0);
    if (b0 < 0x80)
        return 1;
    if (b0 >= 0xC2 && b0 <= 0xDF)
        return continuation(1) ? 2 : 0;
    if (b0 >= 0xE0 && b0 <= 0xEF) {
        if (!continuation(1) || !continuation(2))
            return 0;
        const std::uint8_t b1 = byte(1);
        if (b0 == 0xE0 && b1 < 0xA0)
            return 0; // overlong
        if (b0 == 0xED && b1 >= 0xA0)
            return 0; // UTF-16 surrogate
        return 3;
    }
    if (b0 >= 0xF0 && b0 <= 0xF4) {
        if (!continuation(1) || !continuation(2) || !continuation(3))
            return 0;
        const std::uint8_t b1 = byte(1);
        if (b0 == 0xF0 && b1 < 0x90)
            return 0; // overlong
        if (b0 == 0xF4 && b1 >= 0x90)
            return 0; // > U+10FFFF
        return 4;
    }
    return 0;
}

bool is_hex(char c) {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

std::string json_quoted(const std::string& s) {
    return json(s).dump(-1, ' ', false, json::error_handler_t::replace);
}

const json& require_member(const json& object, const char* name, const std::string& where) {
    const auto it = object.find(name);
    if (it == object.end())
        throw invalid_request(where + name + ": is required");
    return *it;
}

// Why a FilePath is invalid, or an empty string when it is valid.
std::string file_path_problem(std::string_view path) {
    if (path.empty())
        return "path must not be empty";
    if (path.front() == '/')
        return "path must not start with '/'";
    if (!is_file_path(path))
        return "path must be valid UTF-8 without line breaks after the first character";
    return {};
}

} // namespace

bool is_architecture(std::string_view value) {
    return std::find(kArchitectures.begin(), kArchitectures.end(), value) != kArchitectures.end();
}

bool is_uuid(std::string_view value) {
    if (value.size() != 36)
        return false;
    for (std::size_t i = 0; i < value.size(); ++i) {
        const bool hyphen = i == 8 || i == 13 || i == 18 || i == 23;
        if (hyphen ? value[i] != '-' : !is_hex(value[i]))
            return false;
    }
    return true;
}

bool is_file_path(std::string_view value) {
    if (value.empty() || value.front() == '/')
        return false;

    bool first = true;
    while (!value.empty()) {
        const std::size_t length = utf8_sequence_length(value);
        if (length == 0)
            return false;

        if (!first) {
            const std::string_view ch = value.substr(0, length);
            if (ch == "\n" || ch == "\r" || ch == "\xE2\x80\xA8" || ch == "\xE2\x80\xA9")
                return false;
        }

        first = false;
        value.remove_prefix(length);
    }
    return true;
}

json parse_body(const std::string& body) {
    if (body.empty())
        throw invalid_request("request body is required");

    json value = json::parse(body, nullptr, false);
    if (value.is_discarded())
        throw invalid_request("request body is not valid JSON");
    return value;
}

session::StoredProject parse_project_input(const json& value, const std::string& where) {
    if (!value.is_object())
        throw invalid_request(where.empty() ? "request body must be a JSON object"
                                            : where.substr(0, where.size() - 1) +
                                                  ": must be a JSON object");

    session::StoredProject project;

    const json& name = require_member(value, "name", where);
    if (!name.is_string() || name.get_ref<const std::string&>().empty())
        throw invalid_request(where + "name: must be a non-empty string");
    project.name = name.get<std::string>();

    const json& architecture = require_member(value, "architecture", where);
    if (!architecture.is_string() || !is_architecture(architecture.get_ref<const std::string&>()))
        throw invalid_request(where + "architecture: must be one of SIC, SIC-XE");
    project.architecture = architecture.get<std::string>();

    const json& files = require_member(value, "files", where);
    if (!files.is_object())
        throw invalid_request(where + "files: must be an object mapping file paths to contents");

    for (const auto& [path, content] : files.items()) {
        if (const std::string problem = file_path_problem(path); !problem.empty())
            throw invalid_request(where + "files: " + problem);
        if (!content.is_string())
            throw invalid_request(where + "files[" + json_quoted(path) + "]: content must be a string");
        project.files.emplace(path, content.get<std::string>());
    }

    return project;
}

std::vector<session::StoredProject> parse_project_sync(const json& value) {
    if (!value.is_array())
        throw invalid_request("request body must be a JSON array of projects");

    std::vector<session::StoredProject> projects;
    projects.reserve(value.size());
    std::unordered_set<std::string> seen;

    for (std::size_t i = 0; i < value.size(); ++i) {
        const std::string where = "[" + std::to_string(i) + "].";
        const json& item = value[i];

        session::StoredProject project = parse_project_input(item, where);

        const json& id = require_member(item, "id", where);
        if (!id.is_string() || !is_uuid(id.get_ref<const std::string&>()))
            throw invalid_request(where + "id: must be a UUID");
        project.id = id.get<std::string>();

        if (!seen.insert(project.id).second)
            throw invalid_request(where + "id: duplicate project id " + json_quoted(project.id));

        projects.push_back(std::move(project));
    }

    return projects;
}

FileSync parse_file_sync(const json& value) {
    if (!value.is_object())
        throw invalid_request("request body must be a JSON object");

    const json& path = require_member(value, "path", "");
    if (!path.is_string())
        throw invalid_request("path: must be a string");
    if (const std::string problem = file_path_problem(path.get_ref<const std::string&>());
        !problem.empty())
        throw invalid_request(problem);

    const json& content = require_member(value, "content", "");
    if (!content.is_string())
        throw invalid_request("content: must be a string");

    return {path.get<std::string>(), content.get<std::string>()};
}

} // namespace api
