#pragma once

#include <cstdint>
#include <sstream>
#include <string>
#include <vector>

#include "architecture/ArchitectureInfo.hpp"
#include "architecture/ExecutionEvent.hpp"
#include "architecture/events/InstructionExecutor.hpp"

#include "memory/MemoryAccessor.hpp"
#include "memory/RegisterAccessor.hpp"

// One file of a program to load: its project path and its text.
struct SourceFile {
    std::string path;
    std::string text;
};

class IArchitecture {
public:
    IArchitecture(MemoryAccessor& memoryAccessor,
                  RegisterAccessor& registerAccessor,
                  architecture::events::InstructionExecutor& instructionExecutor)
        : m_memoryAccessor(memoryAccessor)
        , m_registerAccessor(registerAccessor)
        , m_instructionExecutor(instructionExecutor) {}
    virtual ~IArchitecture() = default;


    virtual const ArchitectureInfo& info() const noexcept = 0;


    virtual void reset() = 0;

    // Clears loaded memory/program metadata and resets the architecture state.
    virtual void clear() = 0;

    virtual void step() = 0;

    virtual std::vector<ExecutionEvent> consume_events() = 0;

	virtual std::vector<ExecutionEvent> load_file(std::string& string) = 0;

    // Assembles, links and loads `files` (the ENTRY file first, then the order given) at
    // `loadAddress`. Throws std::runtime_error with the diagnostics, memory untouched.
    virtual std::vector<ExecutionEvent> load_files(const std::vector<SourceFile>& files,
                                                   std::uint32_t loadAddress) = 0;

protected:
    MemoryAccessor m_memoryAccessor;
    RegisterAccessor m_registerAccessor;
    architecture::events::InstructionExecutor& m_instructionExecutor;
};
