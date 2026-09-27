#include "SICXE.hpp"

#include <cstdint>
#include <regex>
#include <stdexcept>
#include <string>
#include <unordered_map>

#include "DecodedInstruction.hpp"
#include "InstructionSet.hpp"
#include "architecture/ExecutionEvent.hpp"
#include "architecture/RegisterDescription.hpp"
#include "common/Byte.hpp"

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
    : m_assembler(m_set)
    , IArchitecture(memoryAccessor, registerAccessor) {
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
    for (auto& r : m_info.registers) {
        m_registerAccessor.write(r.name, 0ull);
    }
}

void SICXE::step() {
    const auto pc = m_registerAccessor.read("PC");

    m_memoryAccessor.fetch(pc, m_info.memory.address_width, m_buffer);
    const DecodedInstruction instruction(m_registerAccessor, m_memoryAccessor, m_set, m_buffer);

    std::uint8_t inc = instruction.execute();

    m_events.push(InstructionExecuted{.instruction = instruction.description});

    if (inc)
        m_registerAccessor.write("PC", pc + 3);
}

std::vector<ExecutionEvent> SICXE::load_file(std::string& content) {
    m_memoryAccessor.write(0, m_assembler.assemble(content));
	return consume_events();
}

std::vector<ExecutionEvent> SICXE::consume_events() {
    std::vector<ExecutionEvent> events;

    while (!m_events.empty()) {
        events.push_back(std::move(m_events.front()));
        m_events.pop();
    }

    return events;
}
