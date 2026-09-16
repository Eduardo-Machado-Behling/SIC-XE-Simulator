#include "common/SharedLoader.hpp"

#include <array>
#include <utility>
#include <vector>
#include <regex>
#include <algorithm>

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace {

#ifdef _WIN32
    constexpr const char* kPrefix = "";
    constexpr const char* kExt    = ".dll";
#elif defined(__APPLE__)
    constexpr const char* kPrefix = "lib";
    constexpr const char* kExt    = ".dylib";
#else
    constexpr const char* kPrefix = "lib";
    constexpr const char* kExt    = ".so";
#endif

void* try_open(const std::filesystem::path& p) {
#ifdef _WIN32
    return static_cast<void*>(LoadLibraryA(p.string().c_str()));
#else
    return dlopen(p.string().c_str(), RTLD_LAZY);
#endif
}

std::vector<std::filesystem::path> candidate_names(const std::string& stem) {
    return {
        stem,                                   
        stem + kExt,                             
        kPrefix + stem + kExt,                  
        stem + ".so", "lib" + stem + ".so",      
        stem + ".dll",                           
        stem + ".dylib", "lib" + stem + ".dylib", 
    };
}

} // namespace

bool SharedLoader::load(const std::filesystem::path& path) {
    unload();

    const auto dir  = path.parent_path();
    const auto stem = path.filename().string();

    for (const auto& name : candidate_names(stem)) {
        auto candidate = dir.empty() ? std::filesystem::path(name) : dir / name;
        if (std::filesystem::exists(candidate)) {
            handle_ = try_open(candidate);
            if (handle_) return true;
        }
    }

    if (!dir.empty() && std::filesystem::exists(dir) && std::filesystem::is_directory(dir)) {
        auto to_lower = [](std::string s) {
            std::transform(s.begin(), s.end(), s.begin(),
                           [](unsigned char c) { return std::tolower(c); });
            return s;
        };
        const std::string target = to_lower(stem);

        static const std::regex libPattern(R"(^(?:lib)?(.+)\.(?:dll|so|dylib)$)");

        auto it = std::find_if(
            std::filesystem::directory_iterator(dir),
            std::filesystem::directory_iterator{},
            [&](const std::filesystem::directory_entry& entry) {
                if (!entry.is_regular_file()) return false;
                std::smatch match;
                std::string filename = entry.path().filename().string();
                if (!std::regex_match(filename, match, libPattern)) return false;
                return to_lower(match[1].str()) == target;
            });

        if (it != std::filesystem::directory_iterator{}) {
            handle_ = try_open(it->path());
            if (handle_) return true;
        }
    }

    handle_ = nullptr;
    return false;
}


SharedLoader::SharedLoader(const std::filesystem::path& path) {
    load(path);
}


SharedLoader::~SharedLoader() {
    unload();
}


SharedLoader::SharedLoader(SharedLoader&& other) noexcept
    : handle_(std::exchange(other.handle_, nullptr)) {
}


SharedLoader& SharedLoader::operator=(SharedLoader&& other) noexcept {
    if (this != &other) {
        unload();

        handle_ = std::exchange(
            other.handle_,
            nullptr
        );
    }

    return *this;
}




void SharedLoader::unload() noexcept {
    if (!handle_) {
        return;
    }

#ifdef _WIN32

    FreeLibrary(
        static_cast<HMODULE>(handle_)
    );

#else

    dlclose(handle_);

#endif

    handle_ = nullptr;
}


bool SharedLoader::loaded() const noexcept {
    return handle_ != nullptr;
}


void* SharedLoader::get(const std::string& name) const noexcept {
    if (!handle_) {
        return nullptr;
    }

#ifdef _WIN32

    return reinterpret_cast<void*>(
        GetProcAddress(
            static_cast<HMODULE>(handle_),
            name.c_str()
        )
    );

#else

    return dlsym(
        handle_,
        name.c_str()
    );

#endif
}