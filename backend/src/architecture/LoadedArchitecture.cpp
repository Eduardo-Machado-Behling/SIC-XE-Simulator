#include "architecture/LoadedArchitecture.hpp"

LoadedArchitecture::~LoadedArchitecture() {
    if (loader.loaded()) {
        destroyFunc(m_arch);
        loader.unload();
    }
}
    
void LoadedArchitecture::load(const std::filesystem::path& path, MemoryAccessor& memory, RegisterAccessor& registerAccessor){
    if(loader.loaded()){
        destroyFunc(m_arch);
        loader.unload();
    }

    loader.load(path);
    CreateArch createFunc = loader.get<CreateArch>("create_arch");
    destroyFunc = loader.get<DestroyArch>("destroy_arch");

    m_arch = createFunc(memory, registerAccessor);
}
