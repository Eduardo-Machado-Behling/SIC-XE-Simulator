#pragma once

#include "assembler/assembler.hpp"

#include <unordered_map>

#include "InstructionSet.hpp"
#include "architecture/IArchictecture.hpp"

class SICXE final : public IArchitecture {
public:
    SICXE(MemoryAccessor& memoryAccessor,
          RegisterAccessor& registerAccessor,
          architecture::events::InstructionExecutor& instructionExecutor);

    const ArchitectureInfo& info() const noexcept override;

    void reset() override;
    void clear() override;
    void step() override;

    std::vector<ExecutionEvent> consume_events() override;
    std::vector<ExecutionEvent> load_file(std::string& content) override;

private:
    ArchitectureInfo m_info;
    InstructionSet m_set;

    sicxe::Assembler m_assembler;

    EventQueue m_events;
    std::vector<byte_t> m_buffer;
    bool m_halted = false;
    std::uint32_t m_programStart = 0;
    std::unordered_map<std::uint32_t, std::size_t> m_instructionSourceLines;

    void fetch_for_debugger(std::uint64_t address, bool preview);
};
