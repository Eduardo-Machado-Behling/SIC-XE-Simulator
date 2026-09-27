#pragma once

#include <cstdint>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "InstructionSet.hpp"
#include "common/Byte.hpp"

class Assembler {
public:
    explicit Assembler(InstructionSet& set)
        : m_set(set)
    {}

    std::vector<byte_t> assemble(const std::string& source);

private:
    InstructionSet& m_set;

    static std::uint32_t parse_number(std::string_view text);

    static std::uint8_t register_number(std::string_view name);

    static std::uint8_t encode_opcode(
        std::uint8_t opcode,
        bool n,
        bool i
    );

    std::vector<byte_t> encode_instruction(
        const InstructionData& instruction,
        bool extended,
        std::string_view prefix,
        std::string_view operand,
        bool indexed
    ) const;
};
