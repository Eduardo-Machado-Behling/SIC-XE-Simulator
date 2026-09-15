#include "SICXE.hpp"

#include "architecture/arch_api.h"

extern "C" {
    ARCH_API IArchitecture* create_arch(MemoryAccessor memoryAccessor, RegisterAccessor registerAccessor) {
        return new SICXE(memoryAccessor, registerAccessor);
    }

    ARCH_API void destroy_arch(IArchitecture* arch) {
        delete arch;
    }
}