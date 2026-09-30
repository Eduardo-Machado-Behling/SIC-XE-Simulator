#pragma once

#include <cstdint>
#include <optional>
#include <variant>
#include <vector>

#include "IInstruction.hpp"
#include "InstructionSet.hpp"
#include "architecture/InstructionDescription.hpp"
#include "architecture/events/InstructionExecutor.hpp"
#include "common/Byte.hpp"
#include "operands/AddressOperand.hpp"
#include "operands/FloatOperand.hpp"
#include "operands/NoneOperand.hpp"
#include "operands/RegisterOperand.hpp"
#include "operands/RegisterValueOperand.hpp"
#include "operands/RegistersOperand.hpp"
#include "operands/ValueOperand.hpp"

class RegisterAccessor;
class MemoryAccessor;

using Operands = std::variant<ValueOperand,
                              FloatOperand,
                              AddressOperand,
                              NoneOperand,
                              RegistersOperand,
                              RegisterValueOperand,
                              RegisterOperand>;

class DecodedInstruction {
public:
    explicit DecodedInstruction(RegisterAccessor& state,
                                MemoryAccessor& memory,
                                InstructionSet& set,
                                std::vector<byte_t>& raw,
                                architecture::events::InstructionExecutor& eventExecutor,
                                std::uint64_t instruction_address);

    std::uint8_t execute() const;

    const InstructionDescription* description = nullptr;

private:
    std::uint32_t get_displacement(InstructionFormat format, std::vector<byte_t>& raw) const;

    std::uint32_t get_target_address(RegisterAccessor& regs,
                                     InstructionFormat format,
                                     std::uint32_t displacement,
                                     bool b,
                                     bool p,
                                     bool x) const;

    Operands resolve_operand(MemoryAccessor& memory,
                             InstructionFlags flags,
                             OperandType operand,
                             std::uint32_t ta,
                             bool n,
                             bool i,
                             bool byte_value = false) const;

    const IInstruction* m_implementation = nullptr;
    MemoryAccessor& m_memory;
    RegisterAccessor& m_regs;

    struct {
        bool n = false;
        bool i = false;
        bool x = false;
        bool b = false;
        bool p = false;
        bool e = false;
    } m_flags;

    InstructionFormat m_format;
    std::uint8_t m_format_advance;
    std::uint64_t m_instruction_address;

    architecture::events::InstructionExecutor& m_eventExecutor;

    std::optional<Operands> m_operand = std::nullopt;
};
