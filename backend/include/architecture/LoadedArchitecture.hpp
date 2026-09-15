#pragma once

#include "common/SharedLoader.hpp"
#include "memory/MemoryAccessor.hpp"
#include "memory/RegisterAccessor.hpp"

class IArchitecture;

using CreateArch = IArchitecture* (*)(MemoryAccessor, RegisterAccessor);
using DestroyArch = void (*)(IArchitecture*);

class LoadedArchitecture {
public:
  LoadedArchitecture() = default;
  ~LoadedArchitecture();

  void load(const std::filesystem::path& path, MemoryAccessor& memory, RegisterAccessor& registerAccessor );
  IArchitecture* get() const { return m_arch; }

private:
    LoadedArchitecture(const LoadedArchitecture&) = delete;
    LoadedArchitecture& operator=(const LoadedArchitecture&) = delete;

    SharedLoader loader;
    IArchitecture* m_arch = nullptr;
    DestroyArch destroyFunc = nullptr;
};