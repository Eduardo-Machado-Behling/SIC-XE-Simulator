#include "common/ExecutablePath.hpp"

#include <filesystem>

#ifdef _WIN32
#include <windows.h>
#elif defined(__linux__)
#include <unistd.h>
#include <limits.h>
#elif defined(__APPLE__)
#include <mach-o/dyld.h>
#endif

namespace fs = std::filesystem;

fs::path executable_directory()
{
#ifdef _WIN32

    wchar_t buffer[32768];

    DWORD length = GetModuleFileNameW(
        nullptr,
        buffer,
        std::size(buffer)
    );

    if (length == 0)
        throw std::runtime_error("Failed to get executable path");

    return fs::path(buffer, buffer + length).parent_path();

#elif defined(__linux__)

    char buffer[PATH_MAX];

    const ssize_t length = readlink(
        "/proc/self/exe",
        buffer,
        sizeof(buffer)
    );

    if (length == -1)
        throw std::runtime_error("Failed to get executable path");

    return fs::path(buffer, buffer + length).parent_path();

#elif defined(__APPLE__)

    char buffer[PATH_MAX];
    uint32_t size = sizeof(buffer);

    if (_NSGetExecutablePath(buffer, &size) != 0)
        throw std::runtime_error("Failed to get executable path");

    return fs::absolute(buffer).parent_path();

#else

    #error "Unsupported platform"

#endif
}