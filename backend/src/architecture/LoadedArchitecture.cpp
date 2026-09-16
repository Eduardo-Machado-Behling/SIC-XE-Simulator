#include "architecture/LoadedArchitecture.hpp"

#include <stdexcept>

LoadedArchitecture::~LoadedArchitecture() {
    if (loader.loaded()) {
        destroyFunc(m_arch);
        loader.unload();
    }
}
    
void LoadedArchitecture::load(const std::filesystem::path& path, MemoryAccessor& memory, RegisterAccessor& registerAccessor) {
    if (loader.loaded()) {
        if (destroyFunc && m_arch) {
            destroyFunc(m_arch);
        }
        loader.unload();
    }

    m_arch = nullptr;
    destroyFunc = nullptr;

    if (!loader.load(path)) {
        throw std::runtime_error(
            "Failed to load architecture library: " + path.string()
        );
    }

    CreateArch createFunc = loader.get<CreateArch>("create_arch");
    destroyFunc = loader.get<DestroyArch>("destroy_arch");

    if (!createFunc || !destroyFunc) {
        loader.unload();
        destroyFunc = nullptr;
        throw std::runtime_error(
            "Architecture library missing required symbols (create_arch/destroy_arch): " + path.string()
        );
    }

    m_arch = createFunc(memory, registerAccessor);

    if (!m_arch) {
        loader.unload();
        destroyFunc = nullptr;
        throw std::runtime_error(
            "create_arch() returned null for architecture library: " + path.string()
        );
    }
}