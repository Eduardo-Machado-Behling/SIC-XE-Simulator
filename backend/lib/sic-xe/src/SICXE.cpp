#include "SICXE.hpp"

#include <unordered_map>

#include "DecodedInstruction.hpp"
#include "architecture/RegisterDescription.hpp"

const std::vector<RegisterDescription> REGISTERS = {
    {1, "A", "Accumulator; used for arithmetic operations", 3},
    {2, "X", "Index register; used for addressing", 3},
    {3,
     "L",
     "Linkage register; the Jump to Subroutine (JSUB) instruction stores the return address in "
     "this register",
     3},
    {4, "B", "Base register; used for addressing", 3},
    {5, "S", "General working register-no special use", 3, RegisterType::GENERAL_PURPOSE},
    {6, "T", "General working register-no special use", 3, RegisterType::GENERAL_PURPOSE},
    {7, "F", "Floating-point accumulator (48 bits)", 6},
    {8,
     "PC",
     "Program counter; contains the address of the next instruction to be fetched for execution",
     3},
    {9,
     "SW",
     "Status word; contains a variety of information, including a Condition Code (CC)",
     3}};

SICXE::SICXE(MemoryAccessor memoryAccessor, RegisterAccessor registerAccessor)
    : IArchitecture(memoryAccessor, registerAccessor) {
    m_info.name = "SIC/XE";
    m_info.description = "SIC/XE architecture";

    m_info.memory.address_space_size = 1 << 20;
    m_info.memory.address_width = 4;
    m_info.memory.word_size = 3;

    m_buffer.reserve(m_info.memory.address_width);

    m_info.registers = std::move(REGISTERS);

    m_info.instructions = m_set.descriptions();

    m_memoryAccessor.link(&m_events);
    m_registerAccessor.link(&m_events);
}

const ArchitectureInfo& SICXE::info() const noexcept {
    return m_info;
}

void SICXE::reset() {
    for (auto& r : m_info.registers){
        m_registerAccessor.write(r.name, 0ull);
    }
}

void SICXE::step() {
    const auto pc = m_registerAccessor.read("PC");

    m_memoryAccessor.fetch(pc, m_info.memory.address_width, m_buffer);
    const DecodedInstruction instruction = decode(pc);

    bool inc = instruction.execute(m_registerAccessor, m_memoryAccessor);

    m_events.push(InstructionExecuted{.instruction = instruction.description});

    if (inc)
    m_registerAccessor.write("PC", pc + 3);
}

std::vector<ExecutionEvent> SICXE::consume_events() {
    std::vector<ExecutionEvent> events;

    while (!m_events.empty()) {
        events.push_back(std::move(m_events.front()));
        m_events.pop();
    }

    return events;
}

DecodedInstruction SICXE::decode(uint32_t pc) {
    const std::uint8_t byte1 = m_buffer[0];

    const std::uint8_t opcode = byte1 & 0xFC;

    const InstructionDescription* description = m_set.findByOpcode(opcode);

    if (description == nullptr) {
        throw std::runtime_error("Unknown opcode");
    }

    DecodedInstruction instruction;

    instruction.description = description;
    instruction.address = pc;

    // Format 1
    if (hasFormat(description->formats, InstructionFormat::Format1)) {
        instruction.format = InstructionFormat::Format1;

        return instruction;
    }

    const std::uint8_t byte2 = m_buffer[1];

    // Format 2
    if (hasFormat(description->formats, InstructionFormat::Format2)) {
        instruction.format = InstructionFormat::Format2;

        instruction.r1 = (byte2 >> 4) & 0x0F;

        instruction.r2 = byte2 & 0x0F;

        return instruction;
    }

    // Format 3/4
    instruction.n = (byte1 & 0x02) != 0;

    instruction.i = (byte1 & 0x01) != 0;

    instruction.x = (byte2 & 0x80) != 0;

    instruction.b = (byte2 & 0x40) != 0;

    instruction.p = (byte2 & 0x20) != 0;

    instruction.e = (byte2 & 0x10) != 0;

    if (instruction.e) {
        instruction.format = InstructionFormat::Format4;

        const std::uint8_t byte3 = m_buffer[2];

        const std::uint8_t byte4 = m_buffer[3];

        instruction.displacement = ((byte2 & 0x0F) << 16) | (byte3 << 8) | byte4;
    } else {
        instruction.format = InstructionFormat::Format3;

        const std::uint8_t byte3 = m_buffer[2];

        instruction.displacement = ((byte2 & 0x0F) << 8) | byte3;
    }

    if (!instruction.n && instruction.i) {
        instruction.immediate = instruction.displacement;
    }

    return instruction;
}