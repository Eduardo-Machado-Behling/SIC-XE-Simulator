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
    GIT_TAG v0.50.0
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
# Architecture DLLs
# ==================================================

set(CMAKE_INCLUDE_DIRECTORIES
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

#FIXME: This is fucked up, I need MemoryAccessor code in dlls
set(SHARED_SOURCES
    ${CMAKE_SOURCE_DIR}/src/memory/Memory.cpp
    ${CMAKE_SOURCE_DIR}/src/memory/MemoryAccessor.cpp
    ${CMAKE_SOURCE_DIR}/src/memory/Registers.cpp
    ${CMAKE_SOURCE_DIR}/src/memory/RegisterAccessor.cpp
)

file(GLOB LIB_DIRS LIST_DIRECTORIES true
    "${CMAKE_CURRENT_SOURCE_DIR}/lib/*"
)

function(configure_architecture TARGET)
    set_target_properties(${TARGET} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY
            "${CMAKE_SOURCE_DIR}/bin/archs"

        LIBRARY_OUTPUT_DIRECTORY
            "${CMAKE_SOURCE_DIR}/bin/archs"

        ARCHIVE_OUTPUT_DIRECTORY
            "${CMAKE_SOURCE_DIR}/bin/archs"

        PREFIX ""
    )
endfunction()

foreach(LIB_DIR ${LIB_DIRS})
    if(IS_DIRECTORY "${LIB_DIR}" AND EXISTS "${LIB_DIR}/CMakeLists.txt")
        add_subdirectory("${LIB_DIR}")
    endif()
endforeach()


# ==================================================
# API executable
# ==================================================

file(GLOB_RECURSE API_SOURCES
    CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp"
)

add_executable(
    api
    ${API_SOURCES}
)

target_include_directories(
    api
    PRIVATE
        ${CMAKE_SOURCE_DIR}/include
)

target_link_libraries(
    api
    PRIVATE
        httplib::httplib
        nlohmann_json::nlohmann_json
)

set_target_properties(api PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY
        "${CMAKE_SOURCE_DIR}/bin"

    LIBRARY_OUTPUT_DIRECTORY
        "${CMAKE_SOURCE_DIR}/bin"

    ARCHIVE_OUTPUT_DIRECTORY
        "${CMAKE_SOURCE_DIR}/bin"

    PREFIX ""
)