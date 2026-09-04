cmake_minimum_required(VERSION 3.20)

project(cpp_api)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

# ==================================================
# cpp-httplib configuration
# ==================================================

# Disable MinGW-incompatible non-blocking DNS API.
set(
    HTTPLIB_USE_NON_BLOCKING_GETADDRINFO
    OFF
    CACHE BOOL
    "Disable non-blocking getaddrinfo"
    FORCE
)

# Optional: simplify dependencies for now.
set(
    HTTPLIB_REQUIRE_OPENSSL
    OFF
    CACHE BOOL
    ""
    FORCE
)

set(
    HTTPLIB_REQUIRE_ZLIB
    OFF
    CACHE BOOL
    ""
    FORCE
)

set(
    HTTPLIB_REQUIRE_BROTLI
    OFF
    CACHE BOOL
    ""
    FORCE
)

set(
    HTTPLIB_REQUIRE_ZSTD
    OFF
    CACHE BOOL
    ""
    FORCE
)

FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.27.0
)

FetchContent_MakeAvailable(httplib)

# ==================================================
# nlohmann/json
# ==================================================

FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.12.0
)

FetchContent_MakeAvailable(json)

# ==================================================
# API executable
# ==================================================

add_executable(
    api
    src/main.cpp
)

target_link_libraries(
    api
    PRIVATE
        httplib::httplib
        nlohmann_json::nlohmann_json
)