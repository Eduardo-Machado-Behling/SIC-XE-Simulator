#pragma once

#include "Assembler.hpp"
#include "InstructionSet.hpp"
#include "architecture/IArchictecture.hpp"

class SICXE final : public IArchitecture {
public:
    SICXE(MemoryAccessor memoryAccessor, RegisterAccessor registerAccessor);

    const ArchitectureInfo& info() const noexcept override;

    void reset() override;
    void step() override;

    std::vector<ExecutionEvent> consume_events() override;
    std::vector<ExecutionEvent> load_file(std::string& content) override;

private:
    ArchitectureInfo m_info;
    InstructionSet m_set;

    Assembler m_assembler;

    EventQueue m_events;
    std::vector<byte_t> m_buffer;
};
