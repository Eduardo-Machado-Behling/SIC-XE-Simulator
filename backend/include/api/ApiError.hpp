#pragma once

#include <stdexcept>
#include <string>

#include "pch/JSON.hpp"

namespace api {

// RFC 9457-style problem object, as documented by the `Error` schema in
// api_spec/openapi.yaml: { type, status, title, detail? }.
struct ApiError : std::runtime_error {
    int status;
    std::string type;
    std::string title;
    std::string detail;

    ApiError(int status, std::string type, std::string title, std::string detail = {})
        : std::runtime_error(title + (detail.empty() ? "" : ": " + detail))
        , status(status)
        , type(std::move(type))
        , title(std::move(title))
        , detail(std::move(detail)) {}

    nlohmann::json to_json() const {
        nlohmann::json j = {{"type", type}, {"status", status}, {"title", title}};
        if (!detail.empty())
            j["detail"] = detail;
        return j;
    }
};

// Error `type` values used by the API.
namespace error_type {
inline constexpr const char* InvalidRequest = "invalid-request";
inline constexpr const char* SessionNotFound = "session-not-found";
inline constexpr const char* ProjectNotFound = "project-not-found";
inline constexpr const char* FileNotFound = "file-not-found";
inline constexpr const char* NotFound = "not-found";
inline constexpr const char* PayloadTooLarge = "payload-too-large";
inline constexpr const char* InternalError = "internal-error";
} // namespace error_type

inline ApiError invalid_request(std::string detail) {
    return {400, error_type::InvalidRequest, "Invalid request", std::move(detail)};
}

inline ApiError session_not_found() {
    return {404, error_type::SessionNotFound, "Session not found"};
}

inline ApiError project_not_found() {
    return {404, error_type::ProjectNotFound, "Project not found"};
}

inline ApiError file_not_found() {
    return {404, error_type::FileNotFound, "File not found"};
}

inline ApiError internal_error() {
    return {500, error_type::InternalError, "Internal server error"};
}

} // namespace api
