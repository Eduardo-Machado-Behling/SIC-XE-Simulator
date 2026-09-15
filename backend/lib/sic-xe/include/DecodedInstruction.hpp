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

    // Format 3/4
    std::int32_t displacement = 0;

    // Resolved/effective operand.
    std::uint32_t target_address = 0;

    // Immediate value when applicable.
    std::int32_t immediate = 0;

    void execute(
        RegisterAccessor& state,
        MemoryAccessor& memory
    ) const;
};