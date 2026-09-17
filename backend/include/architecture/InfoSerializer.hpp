#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include <pch/JSON.hpp>

namespace InfoSerializer {

using nlohmann::json;

// ============================================================
// Enums
// ============================================================

inline json serialize(Endianness value)
{
    switch (value) {
        case Endianness::BIG:
            return "big";

        case Endianness::LITTLE:
            return "little";
    }

    return nullptr;
}

inline json serialize(RegisterType value)
{
    switch (value) {
        case RegisterType::GENERAL_PURPOSE:
            return "general_purpose";

        case RegisterType::SPECIAL_PURPOSE:
            return "special_purpose";
    }

    return nullptr;
}

inline json serialize(InstructionFormat value)
{
    std::vector<std::string> formats;

    if (hasFormat(value, InstructionFormat::Format1))
        formats.push_back("format1");

    if (hasFormat(value, InstructionFormat::Format2))
        formats.push_back("format2");

    if (hasFormat(value, InstructionFormat::Format3))
        formats.push_back("format3");

    if (hasFormat(value, InstructionFormat::Format4))
        formats.push_back("format4");

    return formats;
}

inline json serialize(InstructionFlags value)
{
    const auto raw = static_cast<std::uint8_t>(value);

    std::vector<std::string> flags;

    if (raw == 0) {
        flags.push_back("none");
    } else {
        if (raw & static_cast<std::uint8_t>(
                InstructionFlags::Privileged))
            flags.push_back("privileged");

        if (raw & static_cast<std::uint8_t>(
                InstructionFlags::Extended))
            flags.push_back("extended");

        if (raw & static_cast<std::uint8_t>(
                InstructionFlags::Floating))
            flags.push_back("floating");

        if (raw & static_cast<std::uint8_t>(
                InstructionFlags::SetsCC))
            flags.push_back("sets_cc");
    }

    return flags;
}

inline json serialize(OperandType value)
{
    switch (value) {
        case OperandType::None:
            return "none";

        case OperandType::Memory:
            return "memory";

        case OperandType::Register:
            return "register";

        case OperandType::RegisterRegister:
            return "register_register";

        case OperandType::RegisterImmediate:
            return "register_immediate";
    }

    return nullptr;
}

// ============================================================
// MemoryDescription
// ============================================================

inline json serialize(const MemoryDescription& memory)
{
    return {
        {"address_space_size", memory.address_space_size},
        {"address_width",      memory.address_width},
        {"word_size",          memory.word_size},
        {"alignment",          memory.alignment},
        {"endianness",         serialize(memory.endianness)}
    };
}

// ============================================================
// RegisterDescription
// ============================================================

inline json serialize(const RegisterDescription& reg)
{
    return {
        {"id",          reg.id},
        {"name",        reg.name},
        {"description", reg.description},
        {"width",       reg.width},
        {"type",        serialize(reg.type)}
    };
}

// ============================================================
// InstructionDescription
// ============================================================

inline json serialize(const InstructionDescription& instruction)
{
    return {
        {"id",           instruction.id},
        {"mnemonic",     instruction.mnemonic},
        {"opcode",       instruction.opcode},
        {"formats",      serialize(instruction.formats)},
        {"operand_type", serialize(instruction.operand_type)},
        {"flags",        serialize(instruction.flags)}
    };

    // implementation intentionally omitted
}

// ============================================================
// ArchitectureInfo
// ============================================================

inline json serialize(const ArchitectureInfo& architecture)
{
    json registers = json::array();

    for (const auto& reg : architecture.registers)
        registers.push_back(serialize(reg));

    json instructions = json::array();

    for (const auto& instruction : architecture.instructions)
        instructions.push_back(serialize(instruction));

    return {
        {"name",         architecture.name},
        {"description",  architecture.description},
        {"memory",       serialize(architecture.memory)},
        {"registers",    registers},
        {"instructions", instructions}
    };
}

} // namespace InfoSerializer