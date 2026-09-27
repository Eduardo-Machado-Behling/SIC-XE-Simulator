#pragma once

#include <cstdint>
#include <optional>
#include <variant>
#include <vector>

#include "IInstruction.hpp"
#include "InstructionSet.hpp"
#include "architecture/InstructionDescription.hpp"
#include "common/Byte.hpp"
#include "operands/AddressOperand.hpp"
#include "operands/NoneOperand.hpp"
#include "operands/Operand.hpp"
#include "operands/RegisterOperand.hpp"
#include "operands/RegistersOperand.hpp"
#include "operands/ValueOperand.hpp"

class RegisterAccessor;
class MemoryAccessor;

using Operands =
    std::variant<ValueOperand, AddressOperand, NoneOperand, RegistersOperand, RegisterOperand>;

class DecodedInstruction {
public:
    explicit DecodedInstruction(RegisterAccessor& state,
                       MemoryAccessor& memory,
                       InstructionSet& set,
                       std::vector<byte_t>& raw);

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
                             std::uint32_t ta,
                             std::uint32_t displacement,
                             bool n,
                             bool i) const;

    const IInstruction* m_implementation = nullptr;
    MemoryAccessor& m_memory;
    RegisterAccessor& m_regs;

    struct {
        bool n;
        bool i;
        bool x;
        bool b;
        bool p;
        bool e;
    } m_flags;


    InstructionFormat m_format;
    std::uint8_t m_format_advance;

    std::optional<Operands> m_operand = std::nullopt;
};
