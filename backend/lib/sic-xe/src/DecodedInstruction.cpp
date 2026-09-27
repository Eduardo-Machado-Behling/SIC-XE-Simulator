#include "DecodedInstruction.hpp"

#include <csignal>
#include <cstdint>
#include <regex>
#include <variant>
#include <vector>

#include "IInstruction.hpp"
#include "InstructionSet.hpp"
#include "architecture/ExecutionContext.hpp"
#include "architecture/InstructionDescription.hpp"
#include "common/Byte.hpp"
#include "memory/MemoryAccessor.hpp"
#include "memory/RegisterAccessor.hpp"
#include "operands/AddressOperand.hpp"
#include "operands/NoneOperand.hpp"
#include "operands/RegistersOperand.hpp"

std::int32_t sign_extend_12(std::uint32_t value);

DecodedInstruction::DecodedInstruction(RegisterAccessor& regs,
                                       MemoryAccessor& memory,
                                       InstructionSet& set,
                                       std::vector<byte_t>& raw)
    : m_regs(regs)
    , m_memory(memory) {
    const std::uint8_t byte1 = raw[0];
    const std::uint8_t opcode = byte1 & 0xFC;

    const InstructionData* description = set.findByOpcode(opcode);

    if (description == nullptr) {
        throw std::runtime_error("Unknown opcode");
    }

    this->description = &description->description;
	m_implementation = description->implementation;

    if (hasFormat(this->description->formats, InstructionFormat::Format1)) {
        m_format = InstructionFormat::Format1;

        m_operand->emplace<NoneOperand>();
    }

    else if (hasFormat(this->description->formats, InstructionFormat::Format2)) {
        m_format = InstructionFormat::Format2;

        uint8_t r1 = (raw[1] >> 4) & 0x0F;
        uint8_t r2 = raw[1] & 0x0F;

        m_operand = RegistersOperand{.r1 = r1, .r2 = r2};
    }

    else {
        // Format 3/4
        m_flags.n = (raw[0] & 0x02) != 0;
        m_flags.i = (raw[0] & 0x01) != 0;
        m_flags.x = (raw[1] & 0x80) != 0;
        m_flags.b = (raw[1] & 0x40) != 0;
        m_flags.p = (raw[1] & 0x20) != 0;
        m_flags.e = (raw[1] & 0x10) != 0;

        m_format = m_flags.e ? InstructionFormat::Format4 : InstructionFormat::Format3;
        std::uint32_t displacement = get_displacement(m_format, raw);
        std::uint32_t ta =
            get_target_address(regs, m_format, displacement, m_flags.b, m_flags.p, m_flags.x);
        m_operand = resolve_operand(memory, ta, displacement, m_flags.n, m_flags.i);
    }
}

std::uint32_t DecodedInstruction::get_displacement(InstructionFormat format,
                                                   std::vector<byte_t>& raw) const {
    if (format == InstructionFormat::Format4) {
        return (static_cast<std::uint32_t>(raw[1] & 0x0F) << 16) |
               (static_cast<std::uint32_t>(raw[2]) << 8) | static_cast<std::uint32_t>(raw[3]);
    }

    return (static_cast<std::uint32_t>(raw[1] & 0x0F) << 8) | static_cast<std::uint32_t>(raw[2]);
}

std::uint32_t DecodedInstruction::get_target_address(RegisterAccessor& regs,
                                                     InstructionFormat format,
                                                     std::uint32_t displacement,
                                                     bool b,
                                                     bool p,
                                                     bool x) const {
    std::uint32_t ta;

    if (format == InstructionFormat::Format4) {
        ta = displacement;
    } else if (b) {
        ta = regs.read("B") + displacement;
    } else if (p) {
        const auto signed_disp = sign_extend_12(displacement);

        ta = static_cast<std::uint32_t>(regs.read("PC") + signed_disp);
    } else {
        ta = displacement;
    }

    if (x) {
        ta += regs.read("X");
    }

    return ta;
}

Operands DecodedInstruction::resolve_operand(MemoryAccessor& memory,
                                             std::uint32_t ta,
                                             std::uint32_t displacement,
                                             bool n,
                                             bool i) const {
    if (!n && i) {
        return ValueOperand{.value = displacement};
    }

    if (n && !i) {
        return AddressOperand{.address = memory.read<std::uint64_t>(ta)};
    }

    return AddressOperand{.address = ta};
}

std::uint8_t DecodedInstruction::execute() const {
    if (description == nullptr || m_implementation == nullptr) {
        return 0;
    }

    ExecutionContext context{
        .registers = m_regs,
        .memory = m_memory,
    };

    std::visit([&](auto&& operand) { m_implementation->execute(context, operand); }, *m_operand);

    switch (m_format) {
        case InstructionFormat::Format1:
            return 1;
        case InstructionFormat::Format2:
        case InstructionFormat::Format3:
            return 3;
        case InstructionFormat::Format4:
            return 4;
        default:
            return 0;
    }
}

std::int32_t sign_extend_12(std::uint32_t value) {
    value &= 0xFFF;

    if (value & 0x800) {
        value |= 0xFFFFF000;
    }

    return static_cast<std::int32_t>(value);
}
