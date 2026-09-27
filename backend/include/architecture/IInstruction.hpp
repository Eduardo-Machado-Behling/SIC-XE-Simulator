#include "architecture/ExecutionContext.hpp"

#include "operands/AddressOperand.hpp"
#include "operands/NoneOperand.hpp"
#include "operands/RegisterOperand.hpp"
#include "operands/ValueOperand.hpp"

#include <exception>
#include <string>

class UnimplementedInstruction : public std::exception {
private:
    std::string message_;

public:
    explicit UnimplementedInstruction(const std::string& mnemonic)
        : message_("Instruction not implemented: " + mnemonic) {}

    const char* what() const noexcept override {
        return message_.c_str();
    }
};

class IInstruction {
public:
    virtual ~IInstruction() = default;

    virtual bool execute(ExecutionContext& context, ValueOperand operand) const {
		throw UnimplementedInstruction("");
	}
    virtual bool execute(ExecutionContext& context, NoneOperand operand) const {
		throw UnimplementedInstruction("");
	}
	virtual bool execute(ExecutionContext& context, RegistersOperand operand) const {
		throw UnimplementedInstruction("");
	}
    virtual bool execute(ExecutionContext& context, AddressOperand operand) const {
		throw UnimplementedInstruction("");
    }
};
