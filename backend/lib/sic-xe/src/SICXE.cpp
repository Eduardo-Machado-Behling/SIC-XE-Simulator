#include "SICXE.hpp"

#include <cstdint>
#include <memory>
#include <optional>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>

#include "DecodedInstruction.hpp"
#include "InstructionSet.hpp"
#include "architecture/ExecutionEvent.hpp"
#include "architecture/RegisterDescription.hpp"
#include "architecture/events/ProgramAssembled.hpp"
#include "architecture/events/ProgramCleared.hpp"
#include "common/Byte.hpp"
#include "essentials/Word.hpp"

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

SICXE::SICXE(MemoryAccessor& memoryAccessor,
             RegisterAccessor& registerAccessor,
             architecture::events::InstructionExecutor& instructionExecutor)
    : IArchitecture(memoryAccessor, registerAccessor, instructionExecutor) {
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
    m_halted = false;

    for (auto& r : m_info.registers) {
        if (r.name == "PC")
            m_registerAccessor.write("PC",
                                     Word(m_programStart).to_bytes());
        else
            m_registerAccessor.clear(r.name);
    }

    fetch_for_debugger(m_programStart, /*preview=*/true);
}

void SICXE::clear() {
    m_memoryAccessor.clear();
    m_assembler.clear();
    m_instructionSourceLines.clear();
    m_halted = false;

    for (auto& r : m_info.registers) {
        if (r.name == "PC")
            m_registerAccessor.write("PC", Word(m_programStart).to_bytes());
        else
            m_registerAccessor.clear(r.name);
    }

    m_instructionExecutor.execute(std::make_unique<architecture::events::ProgramCleared>());
}

void SICXE::fetch_for_debugger(std::uint64_t address, bool preview) {
    const std::size_t memorySize = m_info.memory.address_space_size;
    const std::size_t fetchSize = m_info.memory.address_width;
    if ((address > memorySize ||
         fetchSize > memorySize - static_cast<std::size_t>(address)) && preview)
        return;

    const auto source = m_instructionSourceLines.find(static_cast<std::uint32_t>(address));
    const std::optional<std::size_t> sourceLine = source == m_instructionSourceLines.end()
        ? std::nullopt
        : std::optional<std::size_t>{source->second};
    m_memoryAccessor.fetch(address, fetchSize, m_buffer, sourceLine, preview);
}

void SICXE::step() {
    if (m_halted)
        return;

    const auto pc = Word::from_bytes(m_registerAccessor.read("PC")).as_unsigned();

    fetch_for_debugger(pc, /*preview=*/false);
    const DecodedInstruction instruction(m_registerAccessor,
                                         m_memoryAccessor,
                                         m_set,
                                         m_buffer,
                                         m_instructionExecutor,
                                         pc);

    instruction.execute();
    m_halted = instruction.description != nullptr && instruction.description->mnemonic == "HALT";
    if (!m_halted) {
        const auto nextPc = Word::from_bytes(m_registerAccessor.read("PC")).as_unsigned();
        fetch_for_debugger(nextPc, /*preview=*/true);
    }
}

std::vector<ExecutionEvent> SICXE::load_file(std::string& content) {
    // Loading establishes a fresh memory/register/assembler state. These
    // mutations are recorded before parsing so a failed load still reports
    // the cleared state to the client through the websocket error response.
    m_programStart = 0;
    m_instructionSourceLines.clear();
    clear();

    if (!content.empty() && content[0] == ';') {
        static const std::regex hex_run(R"(([0-9a-fA-F]{2})+)");

        std::vector<byte_t> buff;
        std::istringstream stream(content);
        std::string line;

        std::getline(stream, line);

        while (std::getline(stream, line)) {
            std::smatch match;
            if (!std::regex_search(line, match, hex_run))
                continue;

            const std::string hex = match.str();
            for (size_t i = 0; i < hex.size(); i += 2) {
                buff.push_back(static_cast<byte_t>(std::stoi(hex.substr(i, 2), nullptr, 16)));
            }
        }

        m_memoryAccessor.write(0, buff);
        m_registerAccessor.write("PC", Word(0).to_bytes());
    } else {
        CodeMemory image;
        try {
            image = m_assembler.assemble(content);
        } catch (...) {
            m_assembler.clear();
            throw;
        }
        const auto entry_point = m_assembler.lastInfo().entryPoint;
        for (const auto& source : m_assembler.lastInfo().instructionSourceMap) {
            m_instructionSourceLines.emplace(static_cast<std::uint32_t>(source.address),
                                             static_cast<std::size_t>(source.line));
        }
        m_programStart = static_cast<std::uint32_t>(entry_point);
        m_memoryAccessor.write(0, image);
        m_registerAccessor.write("PC", Word(m_programStart).to_bytes());

        // Report the symbol table to the editor's Assembler tab.
        nlohmann::json symbols = nlohmann::json::array();
        for (const auto& [name, value] : m_assembler.lastInfo().symbols) {
            symbols.push_back({{"name", name}, {"value", value}});
        }
        m_instructionExecutor.execute(std::make_unique<architecture::events::ProgramAssembled>(
            nlohmann::json{{"symbols", symbols}}));
    }
    m_halted = false;
    fetch_for_debugger(m_programStart, /*preview=*/true);
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
