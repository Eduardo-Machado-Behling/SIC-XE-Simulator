#pragma once

#include <exception>
#include <string>

#include "architecture/ExecutionContext.hpp"
#include "operands/AddressOperand.hpp"
#include "operands/FloatOperand.hpp"
#include "operands/NoneOperand.hpp"
#include "operands/Operand.hpp"
#include "operands/RegisterOperand.hpp"
#include "operands/RegisterValueOperand.hpp"
#include "operands/RegistersOperand.hpp"
#include "operands/ValueOperand.hpp"

class UnimplementedInstruction : public std::exception {
private:
    std::string message_;

public:
    explicit UnimplementedInstruction(const std::string& mnemonic)
        : message_("Instruction not implemented: " + mnemonic) {}

    const char* what() const noexcept override { return message_.c_str(); }
};

#define DECLARE_EXECUTION(__operand)                                                               \
    virtual bool execute(ExecutionContext& context, __operand operand) const {                     \
        throw UnimplementedInstruction(#__operand);                                                \
    }

class IInstruction {
public:
    virtual ~IInstruction() = default;

    // Act as a invalid call
    bool execute(ExecutionContext& context, Operand operand) const {
        throw UnimplementedInstruction("Operand: invalid call");
    }

    DECLARE_EXECUTION(ValueOperand)
    DECLARE_EXECUTION(NoneOperand)
    DECLARE_EXECUTION(RegistersOperand)
    DECLARE_EXECUTION(RegisterOperand)
    DECLARE_EXECUTION(AddressOperand)
    DECLARE_EXECUTION(FloatOperand)
    DECLARE_EXECUTION(RegisterValueOperand)
};

#undef DECLARE_EXECUTION
