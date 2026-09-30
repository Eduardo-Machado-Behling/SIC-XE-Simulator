#pragma once

#include "common/SharedLoader.hpp"
#include "memory/MemoryAccessor.hpp"
#include "memory/RegisterAccessor.hpp"
#include "architecture/events/InstructionExecutor.hpp"

class IArchitecture;

using CreateArch = IArchitecture* (*)(MemoryAccessor,
                                      RegisterAccessor,
                                      architecture::events::InstructionExecutor&);
using DestroyArch = void (*)(IArchitecture*);

class LoadedArchitecture {
public:
  LoadedArchitecture() = default;
  ~LoadedArchitecture();

  void load(const std::filesystem::path& path,
            MemoryAccessor& memory,
            RegisterAccessor& registerAccessor,
            architecture::events::InstructionExecutor& instructionExecutor);
  IArchitecture* get() const { return m_arch; }

private:
    LoadedArchitecture(const LoadedArchitecture&) = delete;
    LoadedArchitecture& operator=(const LoadedArchitecture&) = delete;

    SharedLoader loader;
    IArchitecture* m_arch = nullptr;
    DestroyArch destroyFunc = nullptr;
};
