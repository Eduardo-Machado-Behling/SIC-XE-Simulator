#pragma once

#include <stddef.h>
#include <stdint.h>


#ifdef _WIN32

#define ARCH_API __declspec(dllexport)
#define ARCH_CALL __cdecl

#else

#define ARCH_API __attribute__((visibility("default")))
#define ARCH_CALL

#endif

class IArchitecture;
#include "memory/MemoryAccessor.hpp"

#ifdef __cplusplus
extern "C" {
#endif

ARCH_API IArchitecture* create_arch(MemoryAccessor memoryAccessor, RegisterAccessor registerAccessor);
ARCH_API void destroy_arch(IArchitecture*);

#ifdef __cplusplus
}
#endif