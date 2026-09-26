#pragma once

#include "architecture/InstructionDescription.hpp"

#include <cstdint>

class RegisterAccessor;
class MemoryAccessor;

struct DecodedInstruction
{
    const InstructionDescription* description = nullptr;

    std::uint32_t address = 0;

    InstructionFormat format = InstructionFormat::Format1;

    // Size in bytes (1-4); PC points at address + length while the instruction executes.
    std::uint8_t length = 0;

    // Format 3/4
    bool n = false;
    bool i = false;
    bool x = false;
    bool b = false;
    bool p = false;
    bool e = false;

    // Format 2
    std::uint8_t r1 = 0;
    std::uint8_t r2 = 0;

    // Format 3/4: the raw disp (12 bits), address (format 4, 20 bits) or SIC address (15 bits) field.
    std::int32_t displacement = 0;

    // Beck's TA: PC/base-relative, index and format 4 applied, n/i NOT applied
    // (indirect and immediate are resolved by sicxe::operand*, see Operand.hpp).
    std::uint32_t target_address = 0;

    // Immediate operand (n=0, i=1): equal to target_address. Prefer sicxe::operandWord.
    std::int32_t immediate = 0;

    bool execute(
        RegisterAccessor& state,
        MemoryAccessor& memory
    ) const;
};