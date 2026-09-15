#include "common/SharedLoader.hpp"

#include <utility>

#ifdef _WIN32

#include <windows.h>

#else

#include <dlfcn.h>

#endif


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


bool SharedLoader::load(const std::filesystem::path& path) {
    unload();

#ifdef _WIN32

    handle_ = static_cast<void*>(
        LoadLibraryA(path.string().c_str())
    );

#else

    handle_ = dlopen(
        path.string().c_str(),
        RTLD_LAZY
    );

#endif

    return handle_ != nullptr;
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