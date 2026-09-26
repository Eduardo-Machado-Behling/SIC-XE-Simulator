#include "SICXE.hpp"

#include <algorithm>
#include <unordered_map>

#include "DecodedInstruction.hpp"
#include "Decoder.hpp"
#include "architecture/RegisterDescription.hpp"

namespace {

constexpr std::uint64_t MAX_INSTRUCTION_LENGTH = 4;

} // namespace

// Register numbers are the ones Format 2 instructions encode (Beck 1.3.1/1.3.2, PDF section 2).
const std::vector<RegisterDescription> REGISTERS = {
    {0, "A", "Accumulator; used for arithmetic operations", 3},
    {1, "X", "Index register; used for addressing", 3},
    {2,
     "L",
     "Linkage register; the Jump to Subroutine (JSUB) instruction stores the return address in "
     "this register",
     3},
    {3, "B", "Base register; used for addressing", 3},
    {4, "S", "General working register-no special use", 3, RegisterType::GENERAL_PURPOSE},
    {5, "T", "General working register-no special use", 3, RegisterType::GENERAL_PURPOSE},
    {6, "F", "Floating-point accumulator (48 bits)", 6},
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
    m_info.memory.alignment = 1;
    m_info.memory.endianness = Endianness::BIG;

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
    const auto pc = static_cast<std::uint32_t>(m_registerAccessor.read("PC"));

    // Fetch up to the longest instruction (format 4), but never past the end of memory.
    const std::uint64_t memorySize = m_info.memory.address_space_size;
    const std::uint64_t available = pc < memorySize ? memorySize - pc : 0;
    m_memoryAccessor.fetch(pc, std::min<std::uint64_t>(MAX_INSTRUCTION_LENGTH, available), m_buffer);

    const DecodedInstruction instruction = sicxe::decode(m_set, m_buffer, pc, m_registerAccessor);

    // Beck 1.3.1: PC holds the address of the next instruction while this one executes,
    // which PC-relative operands and JSUB rely on; jumps simply overwrite it.
    m_registerAccessor.write("PC", pc + instruction.length);

    try {
        // The bool execute returns is not used: PC is already advanced.
        instruction.execute(m_registerAccessor, m_memoryAccessor);
    } catch (...) {
        // Leave PC on the instruction that failed so the UI points at it.
        m_registerAccessor.write("PC", pc);
        throw;
    }

    m_events.push(InstructionExecuted{.instruction = instruction.description});
}

std::vector<ExecutionEvent> SICXE::consume_events() {
    std::vector<ExecutionEvent> events;

    while (!m_events.empty()) {
        events.push_back(std::move(m_events.front()));
        m_events.pop();
    }

    return events;
}
