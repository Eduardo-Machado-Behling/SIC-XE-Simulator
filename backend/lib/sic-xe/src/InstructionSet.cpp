#include "InstructionSet.hpp"

#include <stdexcept>
#include <string_view>
#include <unordered_map>

#include "InstructionTable.hpp"
#include "architecture/InstructionDescription.hpp"

InstructionSet::InstructionSet() {
    // The implementation of each row of kInstructionTable, by mnemonic.
    const std::unordered_map<std::string_view, IInstruction*> implementations = {
        {"ADD", &m_add},
        {"ADDF", &m_addf},
        {"ADDR", &m_addr},
        {"AND", &m_and},
        {"CLEAR", &m_clear},
        {"COMP", &m_comp},
        {"COMPF", &m_compf},
        {"COMPR", &m_compr},
        {"DIV", &m_div},
        {"DIVF", &m_divf},
        {"DIVR", &m_divr},
        {"FIX", &m_fix},
        {"FLOAT", &m_float},
        {"HIO", &m_hio},
        {"J", &m_j},
        {"JEQ", &m_jeq},
        {"JGT", &m_jgt},
        {"JLT", &m_jlt},
        {"JSUB", &m_jsub},
        {"LDA", &m_lda},
        {"LDB", &m_ldb},
        {"LDCH", &m_ldch},
        {"LDF", &m_ldf},
        {"LDL", &m_ldl},
        {"LDS", &m_lds},
        {"LDT", &m_ldt},
        {"LDX", &m_ldx},
        {"LPS", &m_lps},
        {"MUL", &m_mul},
        {"MULF", &m_mulf},
        {"MULR", &m_mulr},
        {"NORM", &m_norm},
        {"OR", &m_or},
        {"RD", &m_rd},
        {"RMO", &m_rmo},
        {"RSUB", &m_rsub},
        {"SHIFTL", &m_shiftl},
        {"SHIFTR", &m_shiftr},
        {"SIO", &m_sio},
        {"SSK", &m_ssk},
        {"STA", &m_sta},
        {"STB", &m_stb},
        {"STCH", &m_stch},
        {"STF", &m_stf},
        {"STI", &m_sti},
        {"STL", &m_stl},
        {"STS", &m_sts},
        {"STSW", &m_stsw},
        {"STT", &m_stt},
        {"STX", &m_stx},
        {"SUB", &m_sub},
        {"SUBF", &m_subf},
        {"SUBR", &m_subr},
        {"TD", &m_td},
        {"TIO", &m_tio},
        {"TIX", &m_tix},
        {"TIXR", &m_tixr},
        {"WD", &m_wd},
        {"HALT", &m_halt}
    };

    for (std::size_t id = 0; id < kInstructionCount; ++id) {
        const InstructionSpec& row = kInstructionTable[id];
        const auto implementation = implementations.find(row.mnemonic);
        if (implementation == implementations.end()) {
            // An executable row must run; a non-executable one (SVC) may have no body at all.
            if (row.executable)
                throw std::logic_error("No implementation for " + std::string(row.mnemonic));
            continue;
        }
        m_descriptions.push_back({{static_cast<InstructionId>(id), std::string(row.mnemonic), row.opcode,
                                   row.formats, row.operand_type, row.flags},
                                  implementation->second});
    }
    if (m_descriptions.size() != implementations.size())
        throw std::logic_error("An implementation is bound to no row of the instruction table");
}

const std::vector<InstructionDescription> InstructionSet::descriptions() const noexcept {
	std::vector<InstructionDescription> descs;

	for (auto& d : m_descriptions){
		descs.push_back(d.description);
	}

    return descs;
}

const InstructionData* InstructionSet::findByOpcode(std::uint8_t opcode) const noexcept {
    for (const auto& instruction : m_descriptions) {
        if (instruction.description.opcode == opcode)
            return &instruction;
    }

    return nullptr;
}

const InstructionData* InstructionSet::findByMnemonic(const std::string& mnemonic) const noexcept {
    for (const auto& instruction : m_descriptions) {
        if (instruction.description.mnemonic == mnemonic)
            return &instruction;
    }

    return nullptr;
}
