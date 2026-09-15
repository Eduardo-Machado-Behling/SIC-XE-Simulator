#pragma once

#include <filesystem>
#include <string>
#include <type_traits>

class SharedLoader {
public:
    SharedLoader() = default;
    explicit SharedLoader(const std::filesystem::path& path);

    ~SharedLoader();

    SharedLoader(const SharedLoader&) = delete;
    SharedLoader& operator=(const SharedLoader&) = delete;

    SharedLoader(SharedLoader&& other) noexcept;
    SharedLoader& operator=(SharedLoader&& other) noexcept;

    bool load(const std::filesystem::path& path);
    void unload() noexcept;

    [[nodiscard]]
    bool loaded() const noexcept;

    [[nodiscard]]
    void* get(const std::string& name) const noexcept;

    template <typename T>
    [[nodiscard]]
    T get(const std::string& name) const noexcept
    {
        static_assert(
            std::is_pointer_v<T>,
            "SharedLoader::get<T>() requires a pointer type"
        );

        return reinterpret_cast<T>(get(name));
    }

private:
    void* handle_ = nullptr;
};