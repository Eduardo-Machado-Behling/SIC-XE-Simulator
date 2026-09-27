#include "Assembler.hpp"

namespace {

const std::regex
    instruction_pattern(R"(^\s*(\+?)([a-zA-Z]+)(?:\s+([#@]?)([0-9a-zA-Z]+)((?:,X)?))?\s*$)");

} // namespace

std::vector<byte_t> Assembler::assemble(const std::string& source) {
    std::istringstream stream(source);

    std::string line;

    std::vector<byte_t> program;

    while (std::getline(stream, line)) {
        // Ignore blank lines.
        if (line.find_first_not_of(" \t\r\n") == std::string::npos)
            continue;

        std::smatch match;

        if (!std::regex_match(line, match, instruction_pattern)) {
            throw std::runtime_error("Invalid instruction syntax: " + line);
        }

        const bool extended = !match[1].str().empty();

        const std::string mnemonic = match[2].str();

        const std::string prefix = match[3].str();

        const std::string operand = match[4].str();

        const bool indexed = !match[5].str().empty();

        const InstructionData* instruction = m_set.findByMnemonic(mnemonic);

        if (instruction == nullptr) {
            throw std::runtime_error("Unknown instruction: " + mnemonic);
        }

        const std::vector<byte_t> bytes =
            encode_instruction(*instruction, extended, prefix, operand, indexed);

        program.insert(program.end(), bytes.begin(), bytes.end());
    }

    return program;
}

std::uint32_t Assembler::parse_number(std::string_view text) {
    if (text.empty())
        throw std::runtime_error("Missing operand");

    std::string value{text};

    std::size_t processed = 0;

    int base = 10;

    if (value.starts_with("0x") || value.starts_with("0X")) {
        base = 16;
    }

    const auto result = std::stoul(value, &processed, base);

    if (processed != value.size()) {
        throw std::runtime_error("Invalid numeric operand: " + value);
    }

    return static_cast<std::uint32_t>(result);
}

std::uint8_t Assembler::register_number(std::string_view name) {
    if (name == "A")
        return 0;

    if (name == "X")
        return 1;

    if (name == "L")
        return 2;

    if (name == "B")
        return 3;

    if (name == "S")
        return 4;

    if (name == "T")
        return 5;

    if (name == "F")
        return 6;

    if (name == "PC")
        return 8;

    if (name == "SW")
        return 9;

    throw std::runtime_error("Unknown register: " + std::string{name});
}

std::uint8_t Assembler::encode_opcode(std::uint8_t opcode, bool n, bool i) {
    return static_cast<std::uint8_t>((opcode & 0xFC) | (n ? 0x02 : 0x00) | (i ? 0x01 : 0x00));
}

std::vector<byte_t> Assembler::encode_instruction(const InstructionData& instruction,
                                                  bool extended,
                                                  std::string_view prefix,
                                                  std::string_view operand,
                                                  bool indexed) const {
    const auto& description = instruction.description;

    // ---------------------------------------------------------
    // Addressing mode
    // ---------------------------------------------------------

    bool n = true;
    bool i = true;

    if (prefix == "#") {
        n = false;
        i = true;
    } else if (prefix == "@") {
        n = true;
        i = false;
    } else if (!prefix.empty()) {
        throw std::runtime_error("Invalid addressing prefix");
    }

    // ---------------------------------------------------------
    // Format 1
    // ---------------------------------------------------------

    if (hasFormat(description.formats, InstructionFormat::Format1)) {
        if (extended) {
            throw std::runtime_error("Format 1 instruction cannot be extended: " +
                                     description.mnemonic);
        }

        if (!operand.empty()) {
            throw std::runtime_error("Format 1 instruction cannot have an operand: " +
                                     description.mnemonic);
        }

        return {static_cast<byte_t>(description.opcode)};
    }

    // ---------------------------------------------------------
    // Format 2
    // ---------------------------------------------------------

    if (hasFormat(description.formats, InstructionFormat::Format2)) {
        if (extended) {
            throw std::runtime_error("Format 2 instruction cannot be extended: " +
                                     description.mnemonic);
        }

        if (prefix != "") {
            throw std::runtime_error("Format 2 instruction cannot use # or @: " +
                                     description.mnemonic);
        }

        if (indexed) {
            throw std::runtime_error("Format 2 instruction cannot be indexed: " +
                                     description.mnemonic);
        }

        if (operand.empty()) {
            throw std::runtime_error("Missing operand for: " + description.mnemonic);
        }

        const auto comma = operand.find(',');

        const std::string_view r1 = operand.substr(0, comma);

        std::string_view r2;

        if (comma != std::string_view::npos) {
            r2 = operand.substr(comma + 1);
        }

        const std::uint8_t first = register_number(r1);

        const std::uint8_t second = r2.empty() ? 0 : register_number(r2);

        return {static_cast<byte_t>(description.opcode),

                static_cast<byte_t>((first << 4) | second)};
    }

    // ---------------------------------------------------------
    // Format 3 / 4
    // ---------------------------------------------------------

    if (!hasFormat(description.formats, InstructionFormat::Format3) &&
        !hasFormat(description.formats, InstructionFormat::Format4)) {
        throw std::runtime_error("Instruction has no Format 3/4 encoding: " + description.mnemonic);
    }

    if (operand.empty()) {
        throw std::runtime_error("Missing operand for: " + description.mnemonic);
    }

    const std::uint32_t value = parse_number(operand);

    const std::uint8_t encoded_opcode = encode_opcode(description.opcode, n, i);

    // ---------------------------------------------------------
    // Format 4
    // ---------------------------------------------------------

    if (extended) {
        if (!hasFormat(description.formats, InstructionFormat::Format4)) {
            throw std::runtime_error("Instruction does not support Format 4: " +
                                     description.mnemonic);
        }

        if (value > 0xFFFFF) {
            throw std::runtime_error("Format 4 operand exceeds 20 bits: " + std::string{operand});
        }

        std::uint32_t field = value;

        if (indexed)
            field |= 0x80000;

        return {encoded_opcode,

                static_cast<byte_t>(0x10 | ((field >> 16) & 0x0F)),

                static_cast<byte_t>((field >> 8) & 0xFF),

                static_cast<byte_t>(field & 0xFF)};
    }

    // ---------------------------------------------------------
    // Format 3
    // ---------------------------------------------------------

    if (!hasFormat(description.formats, InstructionFormat::Format3)) {
        throw std::runtime_error("Instruction does not support Format 3: " + description.mnemonic);
    }

    if (value > 0xFFF) {
        throw std::runtime_error("Format 3 operand exceeds 12 bits: " + std::string{operand});
    }

    std::uint16_t field = static_cast<std::uint16_t>(value);

    if (indexed)
        field |= 0x800;

    return {encoded_opcode,

            static_cast<byte_t>((field >> 8) & 0xFF),

            static_cast<byte_t>(field & 0xFF)};
}
