#include "DecodedInstruction.hpp"

#include <cmath>
#include <algorithm>
#include <csignal>
#include <cstdint>
#include <memory>
#include <regex>
#include <string>
#include <stdexcept>
#include <type_traits>
#include <variant>
#include <vector>

#include "IInstruction.hpp"
#include "InstructionSet.hpp"
#include "architecture/ExecutionContext.hpp"
#include "architecture/InstructionDescription.hpp"
#include "architecture/events/InstructionDecoded.hpp"
#include "architecture/events/InstructionExecuted.hpp"
#include "common/Byte.hpp"
#include "memory/MemoryAccessor.hpp"
#include "memory/RegisterAccessor.hpp"
#include "operands/AddressOperand.hpp"
#include "operands/NoneOperand.hpp"
#include "operands/RegistersOperand.hpp"

std::int32_t sign_extend_12(std::uint32_t value);

namespace {

nlohmann::json serialize_operand(const Operands& operand) {
    return std::visit([](const auto& value) -> nlohmann::json {
        using T = std::decay_t<decltype(value)>;

        if constexpr (std::is_same_v<T, ValueOperand>) {
            return {{"kind", "value"}, {"value", value.value.as_unsigned()}};
        } else if constexpr (std::is_same_v<T, FloatOperand>) {
            return {{"kind", "float"}, {"bits", value.value.bits()}};
        } else if constexpr (std::is_same_v<T, AddressOperand>) {
            return {{"kind", "address"}, {"address", value.address.as_unsigned()}};
        } else if constexpr (std::is_same_v<T, RegistersOperand>) {
            return {{"kind", "registers"}, {"r1", value.r1}, {"r2", value.r2}};
        } else if constexpr (std::is_same_v<T, RegisterValueOperand>) {
            return {{"kind", "register_value"},
                    {"register", value.r1}, {"value", value.v2.as_unsigned()}};
        } else if constexpr (std::is_same_v<T, RegisterOperand>) {
            return {{"kind", "register"}, {"register", value.r1}};
        } else {
            return {{"kind", "none"}};
        }
    }, operand);
}

std::uint8_t format_length(InstructionFormat format) {
    switch (format) {
        case InstructionFormat::Format1: return 1;
        case InstructionFormat::Format2: return 2;
        case InstructionFormat::Format3: return 3;
        case InstructionFormat::Format4: return 4;
        default: return 0;
    }
}

} // namespace

DecodedInstruction::DecodedInstruction(RegisterAccessor& regs,
                                       MemoryAccessor& memory,
                                       InstructionSet& set,
                                       std::vector<byte_t>& raw,
                                       architecture::events::InstructionExecutor& eventExecutor,
                                       std::uint64_t instruction_address)
    : m_memory(memory)
    , m_regs(regs)
    , m_instruction_address(instruction_address)
    , m_eventExecutor(eventExecutor) {
    const std::uint8_t byte1 = raw[0];
    const std::uint8_t opcode = byte1 & 0xFC;

    const InstructionData* description = set.findByOpcode(opcode);

    if (description == nullptr) {
        throw std::runtime_error("Unknown opcode");
    }

    this->description = &description->description;
    m_implementation = description->implementation;

    std::uint32_t displacement = 0;
    std::uint32_t target_address = 0;

    if (hasFormat(this->description->formats, InstructionFormat::Format1)) {
        m_format = InstructionFormat::Format1;

        m_operand = NoneOperand{};
    }

    else if (hasFormat(this->description->formats, InstructionFormat::Format2)) {
        m_format = InstructionFormat::Format2;

        uint8_t r1 = (raw[1] >> 4) & 0x0F;
        uint8_t r2 = raw[1] & 0x0F;

        switch (this->description->operand_type) {
            case OperandType::Register:
                m_operand = RegisterOperand{.r1 = r1};
                break;
            case OperandType::RegisterRegister:
                m_operand = RegistersOperand{.r1 = r1, .r2 = r2};
                break;
            case OperandType::RegisterImmediate:
                m_operand = RegisterValueOperand{.r1 = r1, .v2 = r2};
                break;
            default:
                throw std::runtime_error("Invalid operand type for format 2 instruction");
        }
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
        displacement = get_displacement(m_format, raw);
        target_address =
            get_target_address(regs, m_format, displacement, m_flags.b, m_flags.p, m_flags.x);
        m_operand = resolve_operand(memory,
                                    description->description.flags,
                                    description->description.operand_type,
                                    target_address,
                                    m_flags.n,
                                    m_flags.i,
                                    description->description.mnemonic == "LDCH");
    }

    m_format_advance = format_length(m_format);
    const std::size_t instruction_size = std::min<std::size_t>(m_format_advance, raw.size());
    const std::vector<byte_t> instruction_bytes(raw.begin(), raw.begin() + instruction_size);
    const nlohmann::json details = {
        {"address", instruction_address},
        {"instruction_bytes", instruction_bytes},
        {"fetched_bytes", raw},
        {"format", static_cast<std::uint8_t>(m_format)},
        {"length", m_format_advance},
        {"displacement", displacement},
        {"target_address", target_address},
        {"flags", {{"n", m_flags.n}, {"i", m_flags.i}, {"x", m_flags.x},
                    {"b", m_flags.b}, {"p", m_flags.p}, {"e", m_flags.e}}},
        {"instruction", {
            {"id", this->description->id},
            {"mnemonic", this->description->mnemonic},
            {"opcode", this->description->opcode},
            {"formats", static_cast<std::uint8_t>(this->description->formats)},
            {"operand_type", static_cast<std::uint8_t>(this->description->operand_type)},
            {"instruction_flags", static_cast<std::uint8_t>(this->description->flags)}
        }},
        {"operand", serialize_operand(*m_operand)}
    };

    m_eventExecutor.execute(
        std::make_unique<architecture::events::InstructionDecoded>(details));
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
        ta = Word::from_bytes(regs.read("B")).as_unsigned() + displacement;
    } else if (p) {
        const auto signed_disp = sign_extend_12(displacement);

        ta = static_cast<std::uint32_t>(m_instruction_address + format_length(format) + signed_disp);
    } else {
        ta = displacement;
    }

    if (x) {
        ta += Word::from_bytes(regs.read("X")).as_signed();
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
    std::vector<byte_t> buf(3, 0);
    memory.read(address, buf.begin(), buf.end());

    // SIC/XE is big-endian: buf[0] is the most significant byte
    std::uint32_t raw = (static_cast<std::uint32_t>(buf[0]) << 16) |
                        (static_cast<std::uint32_t>(buf[1]) << 8) |
                        static_cast<std::uint32_t>(buf[2]);

    // Sign-extend from 24 bits to 32 bits
    return static_cast<std::int32_t>(raw ^ 0x800000u) - 0x800000;
}

inline double readFloat(MemoryAccessor& memory, std::uint64_t address) {
    std::vector<byte_t> buf(6, 0);
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

    std::vector<byte_t> buf(6, 0);
    for (int i = 5; i >= 0; --i) {
        buf[i] = static_cast<byte_t>(raw & 0xFF);
        raw >>= 8;
    }
    memory.write(address, buf);
}

Operands DecodedInstruction::resolve_operand(MemoryAccessor& memory,
                                             InstructionFlags flags,
                                             OperandType operand,
                                             std::uint32_t ta,
                                             bool n,
                                             bool i,
                                             bool byte_value) const {
    constexpr std::uint32_t ADDR_MASK = 0xFFFFFF;
    ta &= ADDR_MASK;

    if (operand == OperandType::None) return NoneOperand{};

    const bool floating = hasFlag(flags, InstructionFlags::Floating);

    if (is_immediate(n, i)) {
        if (operand == OperandType::Address)
            return AddressOperand{.address = ta};
        if (operand != OperandType::Value)
            throw std::runtime_error("Invalid operand type for format 3/4 instruction");
        if (floating)
            throw std::runtime_error("Immediate float, not possible!");
        return ValueOperand{.value = static_cast<std::int32_t>(ta)};
    }

    std::uint32_t location = ta;
    if (is_indirect(n, i))
        location = static_cast<std::uint32_t>(readWord(memory, ta)) & ADDR_MASK;

    if (operand == OperandType::Address)
        return AddressOperand{.address = location};
    if (operand != OperandType::Value)
        throw std::runtime_error("Invalid operand type for format 3/4 instruction");
    if (floating)
        return FloatOperand{.value = Float(readFloat(memory, location))};
    if (byte_value) {
        std::vector<byte_t> byte(1, 0);
        memory.read(location, 1, byte);
        return ValueOperand{.value = Word(static_cast<std::uint32_t>(byte.front()))};
    }
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


    m_regs.write("PC", Word(static_cast<std::uint32_t>(m_instruction_address + m_format_advance))
                          .to_bytes());

    std::visit([&](auto&& operand) { m_implementation->execute(context, operand); }, *m_operand);
    m_eventExecutor.execute(
        std::make_unique<architecture::events::InstructionExecuted>(description));

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
