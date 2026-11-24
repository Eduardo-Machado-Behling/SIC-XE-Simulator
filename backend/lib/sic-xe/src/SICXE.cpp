#include "SICXE.hpp"

#include <algorithm>
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
#include "LinkReportJson.hpp"
#include "MacroReportJson.hpp"
#include "architecture/ExecutionEvent.hpp"
#include "architecture/RegisterDescription.hpp"
#include "architecture/events/MacrosExpanded.hpp"
#include "architecture/events/ProgramAssembled.hpp"
#include "architecture/events/ProgramLinked.hpp"
#include "architecture/events/ProgramCleared.hpp"
#include "assembler/linker.hpp"
#include "assembler/loader.hpp"
#include "assembler/object_text.hpp"
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
    std::optional<std::size_t> sourceLine;
    std::optional<std::string> sourceFile;
    if (source != m_instructionSourceLines.end()) {
        sourceLine = source->second.line;
        if (!source->second.file.empty())
            sourceFile = source->second.file;
    }
    m_memoryAccessor.fetch(address, fetchSize, m_buffer, sourceLine, preview, sourceFile);
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
    return load_files({{"", content}}, 0);
}

void SICXE::load_hex_dump(const std::string& content) {
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
}

namespace {

// The diagnostics of one file; with several files each line says which file it is in.
std::string formatForFile(const std::string& path, const std::vector<sicxe::Diagnostic>& diagnostics, bool name) {
    std::string out;
    for (const auto& d : diagnostics)
        out += (name ? path + ":" : std::string()) + d.toString() + "\n";
    return out;
}

} // namespace

std::vector<ExecutionEvent> SICXE::load_files(const std::vector<SourceFile>& files,
                                              std::uint32_t loadAddress) {
    // Loading establishes a fresh memory/register/assembler state. These
    // mutations are recorded before parsing so a failed load still reports
    // the cleared state to the client through the websocket error response.
    m_programStart = 0;
    m_instructionSourceLines.clear();
    clear();

    if (files.empty())
        throw std::runtime_error("No file to load");
    const auto isHexDump = [](const SourceFile& file) { return !file.text.empty() && file.text[0] == ';'; };
    const bool anyHexDump = std::any_of(files.begin(), files.end(), isHexDump);

    if (anyHexDump) {
        if (files.size() > 1)
            throw std::runtime_error("a hex dump cannot be linked");
        if (loadAddress != 0)
            throw std::runtime_error("a hex dump cannot be relocated; set the load address to 0");
        load_hex_dump(files[0].text);
    } else {
        // Each file goes through the macro processor and the assembler on its own. The
        // report is emitted before assembling so a failed load still sends it; source_line
        // values below are lines of the file's MASMAPRG.ASM.
        const bool name = files.size() > 1;
        std::vector<sicxe::MacroResult> macros;
        std::vector<sicxe::LinkInput> inputs;
        std::vector<std::pair<std::string, std::string>> objectTexts;
        macros.reserve(files.size());
        for (const SourceFile& file : files) {
            macros.push_back(sicxe::MacroProcessor().process(file.text));
            const sicxe::MacroResult& expanded = macros.back();
            nlohmann::json report = sicxe::macroReportJson(expanded);
            if (!file.path.empty())
                report["source"] = sicxe::validUtf8(file.path);
            m_instructionExecutor.execute(std::make_unique<architecture::events::MacrosExpanded>(std::move(report)));
            if (!expanded.ok())
                throw std::runtime_error(formatForFile(file.path, expanded.diagnostics, name));

            sicxe::AssemblyResult assembled = m_assembler.assembleDetailed(expanded.text);
            if (!assembled.ok())
                throw std::runtime_error(formatForFile(
                    file.path, sicxe::remapAssemblyDiagnostics(expanded, file.text, assembled.info.diagnostics), name));
            for (auto& section : assembled.object.sections)
                section.sourceFile = file.path;
            objectTexts.push_back({file.path, sicxe::renderObjectText(assembled.object).text});
            inputs.push_back({file.path, std::move(assembled.object)});
        }

        const sicxe::LinkResult linked = sicxe::link(std::move(inputs));
        const sicxe::LoadResult loaded = linked.ok()
            ? sicxe::relocateAndLoad(linked, loadAddress, m_info.memory.address_space_size)
            : sicxe::LoadResult{};
        m_instructionExecutor.execute(std::make_unique<architecture::events::ProgramLinked>(
            sicxe::linkReportJson(linked, loaded, objectTexts, loadAddress)));

        std::string problems;
        for (const auto* diagnostics : {&linked.diagnostics, &loaded.diagnostics}) {
            for (const sicxe::FileDiagnostic& d : *diagnostics) {
                // The linker reports lines of each file's MASMAPRG.ASM: map them back to the source.
                std::vector<sicxe::Diagnostic> one{d.diagnostic};
                for (std::size_t i = 0; i < files.size(); ++i)
                    if (files[i].path == d.file) one = sicxe::remapAssemblyDiagnostics(macros[i], files[i].text, one);
                problems += formatForFile(d.file, one, name);
            }
        }
        if (!problems.empty())
            throw std::runtime_error(problems);

        for (const sicxe::LinkedSourceLocation& source : loaded.sourceMap)
            m_instructionSourceLines.emplace(static_cast<std::uint32_t>(source.address),
                                             SourceLocation{source.file, static_cast<std::size_t>(source.line)});
        m_programStart = static_cast<std::uint32_t>(loaded.entryPoint);
        m_memoryAccessor.write(0, loaded.memory);
        m_registerAccessor.write("PC", Word(m_programStart).to_bytes());

        // Report the symbol table to the editor's Assembler tab, in loaded addresses.
        const bool absolute = !linked.linked.sections.empty() && linked.linked.sections[0].start != 0;
        const std::int64_t shift = absolute ? 0 : static_cast<std::int64_t>(loadAddress);
        nlohmann::json symbols = nlohmann::json::array();
        for (const sicxe::SymbolRow& row : linked.symbols) {
            symbols.push_back({{"name", row.name},
                               {"value", row.value + (row.relative ? shift : 0)},
                               {"section", row.section},
                               {"file", row.file}});
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
