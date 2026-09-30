#include "DecodedInstruction.hpp"

#include <cmath>
#include <csignal>
#include <cstdint>
#include <regex>
#include <stdexcept>
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

        if (this->description->operand_type == OperandType::RegisterImmediate)
            m_operand = RegisterValueOperand{.r1 = r1, .v2 = r2};
        else
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
        m_operand = resolve_operand(memory, ta, m_flags.n, m_flags.i);
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

inline bool is_direct(bool n, bool i) {
    return n && i;
}
inline bool is_indirect(bool n, bool i) {
    return n && !i;
}
inline bool is_immediate(bool n, bool i) {
    return !n && i;
}

inline std::int32_t readWord(MemoryAccessor& memory, std::uint64_t address) {
    std::vector<byte_t> buf{3, 0};
    memory.read(address, buf.begin(), buf.end());

    // SIC/XE is big-endian: buf[0] is the most significant byte
    std::uint32_t raw = (static_cast<std::uint32_t>(buf[0]) << 16) |
                        (static_cast<std::uint32_t>(buf[1]) << 8) |
                        static_cast<std::uint32_t>(buf[2]);

    // Sign-extend from 24 bits to 32 bits
    return static_cast<std::int32_t>(raw ^ 0x800000u) - 0x800000;
}

inline double readFloat(MemoryAccessor& memory, std::uint64_t address) {
    std::vector<byte_t> buf{6, 0};
    memory.read(address, buf.begin(), buf.end());

    std::uint64_t raw = 0;
    for (byte_t b : buf)
        raw = (raw << 8) | (static_cast<std::uint64_t>(b) & 0xFF);

    const bool negative = (raw >> 47) & 1;
    const int exponent = static_cast<int>((raw >> 36) & 0x7FF);
    const std::uint64_t fraction = raw & 0xFFFFFFFFFULL; // 36 bits

    if (fraction == 0)
        return 0.0;

    double value = std::ldexp(static_cast<double>(fraction), exponent - 1024 - 36);
    return negative ? -value : value;
}

inline void writeWord(MemoryAccessor& memory, std::uint64_t address, std::int32_t value) {
    std::vector<byte_t> buf = {static_cast<byte_t>((value >> 16) & 0xFF),
                               static_cast<byte_t>((value >> 8) & 0xFF),
                               static_cast<byte_t>(value & 0xFF)};

    memory.write(address, buf);
}

inline void writeFloat(MemoryAccessor& memory, std::uint64_t address, double value) {
    std::uint64_t raw = 0;

    if (value != 0.0 && std::isfinite(value)) {
        const bool negative = std::signbit(value);

        int exp2;
        double m = std::frexp(std::fabs(value), &exp2); // m in [0.5, 1)
        int biased = exp2 + 1024;

        if (biased >= 0 && biased <= 0x7FF) {
            std::uint64_t fraction = static_cast<std::uint64_t>(std::ldexp(m, 36));
            raw = (static_cast<std::uint64_t>(negative) << 47) |
                  (static_cast<std::uint64_t>(biased) << 36) | (fraction & 0xFFFFFFFFFULL);
        }
    }

    std::vector<byte_t> buf{6, 0};
    for (int i = 5; i >= 0; --i) {
        buf[i] = static_cast<byte_t>(raw & 0xFF);
        raw >>= 8;
    }
    memory.write(address, buf);
}

Operands DecodedInstruction::resolve_operand(MemoryAccessor& memory,
                                             OperandType operand_type,
                                             InstructionFlags flags,
                                             std::uint32_t ta,
                                             bool n,
                                             bool i) const {
    constexpr std::uint32_t ADDR_MASK = 0xFFFFFF;
    ta &= ADDR_MASK;

    const bool floating = hasFlag(flags, InstructionFlags::Floating);

    if (is_immediate(n, i)) {
        if (operand_type == OperandType::Memory)
            return AddressOperand{.address = ta};
        if (floating)
            throw std::runtime_error("Immediate float, not possible!");
        return ValueOperand{.value = static_cast<std::int32_t>(ta)};
    }

    std::uint32_t location = ta;
    if (is_indirect(n, i))
        location = static_cast<std::uint32_t>(readWord(memory, ta)) & ADDR_MASK;

    if (operand_type == OperandType::Memory)
        return AddressOperand{.address = location};
    if (floating)
        return FloatOperand{.value = readFloat(memory, location)};
    return ValueOperand{.value = readWord(memory, location)};
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
