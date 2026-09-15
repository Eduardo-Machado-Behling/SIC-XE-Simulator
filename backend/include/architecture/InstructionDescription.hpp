#pragma once

#include <cstdint>
#include <string>
#include <vector>
#include <memory>

using InstructionId = std::uint32_t;

enum class InstructionFormat : std::uint8_t
{
    Format1 = 1 << 0,
    Format2 = 1 << 1,
    Format3 = 1 << 2,
    Format4 = 1 << 3
};

enum class InstructionFlags : std::uint8_t
{
    None       = 0,
    Privileged = 1 << 0, // P
    Extended   = 1 << 1, // X: XE-only
    Floating   = 1 << 2, // F
    SetsCC     = 1 << 3  // C
};

enum class OperandType : std::uint8_t
{
    None,

    Memory,             // m
    Register,           // r1
    RegisterRegister,   // r1,r2
    RegisterImmediate   // r1,n
};

constexpr InstructionFormat operator|(
    InstructionFormat lhs,
    InstructionFormat rhs
) noexcept
{
    return static_cast<InstructionFormat>(
        static_cast<std::uint8_t>(lhs) |
        static_cast<std::uint8_t>(rhs)
    );
}

constexpr bool hasFormat(
    InstructionFormat formats,
    InstructionFormat format
) noexcept
{
    return (
        static_cast<std::uint8_t>(formats) &
        static_cast<std::uint8_t>(format)
    ) != 0;
}

constexpr InstructionFlags operator|(
    InstructionFlags lhs,
    InstructionFlags rhs
) noexcept
{
    return static_cast<InstructionFlags>(
        static_cast<std::uint8_t>(lhs) |
        static_cast<std::uint8_t>(rhs)
    );
}

struct IInstruction;


struct InstructionDescription
{
    InstructionId id;
    std::string mnemonic;
    std::uint8_t opcode;
    InstructionFormat formats;
    OperandType operand_type;
    InstructionFlags flags;

    const IInstruction* implementation;
};