#pragma once

#include "architecture/IArchictecture.hpp"
#include "InstructionSet.hpp"

#include <queue>

class SICXE final : public IArchitecture {
public:
    SICXE(MemoryAccessor memoryAccessor, RegisterAccessor registerAccessor);

    const ArchitectureInfo& info() const noexcept override;

    void reset() override;
    void step() override;

    std::vector<ExecutionEvent> consume_events() override;

private:
    DecodedInstruction decode(uint32_t pc);

    ArchitectureInfo m_info;
    InstructionSet m_set;

    EventQueue m_events;
    std::vector<byte_t> m_buffer;
};