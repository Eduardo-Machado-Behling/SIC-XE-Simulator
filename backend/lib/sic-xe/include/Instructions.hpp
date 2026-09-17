#pragma once

#include <exception>
#include <string>
#include <vector>

#include "architecture/IInstruction.hpp"

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

#define DECLARE_INSTRUCTION(name)                                                                  \
    class name final : public IInstruction {                                                       \
    public:                                                                                        \
        bool execute(ExecutionContext& context) const override;                                    \
    };

DECLARE_INSTRUCTION(AddInstruction)
DECLARE_INSTRUCTION(AddFInstruction)
DECLARE_INSTRUCTION(AddRInstruction)

DECLARE_INSTRUCTION(AndInstruction)

DECLARE_INSTRUCTION(ClearInstruction)

DECLARE_INSTRUCTION(CompInstruction)
DECLARE_INSTRUCTION(CompFInstruction)
DECLARE_INSTRUCTION(CompRInstruction)

DECLARE_INSTRUCTION(DivInstruction)
DECLARE_INSTRUCTION(DivFInstruction)
DECLARE_INSTRUCTION(DivRInstruction)

DECLARE_INSTRUCTION(FixInstruction)
DECLARE_INSTRUCTION(FloatInstruction)

DECLARE_INSTRUCTION(HioInstruction)

DECLARE_INSTRUCTION(JInstruction)
DECLARE_INSTRUCTION(JeqInstruction)
DECLARE_INSTRUCTION(JgtInstruction)
DECLARE_INSTRUCTION(JltInstruction)
DECLARE_INSTRUCTION(JsubInstruction)

DECLARE_INSTRUCTION(LdaInstruction)
DECLARE_INSTRUCTION(LdbInstruction)
DECLARE_INSTRUCTION(LdchInstruction)
DECLARE_INSTRUCTION(LdfInstruction)
DECLARE_INSTRUCTION(LdlInstruction)
DECLARE_INSTRUCTION(LdsInstruction)
DECLARE_INSTRUCTION(LdtInstruction)
DECLARE_INSTRUCTION(LdxInstruction)
DECLARE_INSTRUCTION(LpsInstruction)

DECLARE_INSTRUCTION(MulInstruction)
DECLARE_INSTRUCTION(MulFInstruction)
DECLARE_INSTRUCTION(MulRInstruction)

DECLARE_INSTRUCTION(NormInstruction)

DECLARE_INSTRUCTION(OrInstruction)

DECLARE_INSTRUCTION(RdInstruction)

DECLARE_INSTRUCTION(RmoInstruction)

DECLARE_INSTRUCTION(RsubInstruction)

DECLARE_INSTRUCTION(ShiftLInstruction)
DECLARE_INSTRUCTION(ShiftRInstruction)

DECLARE_INSTRUCTION(SioInstruction)
DECLARE_INSTRUCTION(SskInstruction)

DECLARE_INSTRUCTION(StaInstruction)
DECLARE_INSTRUCTION(StbInstruction)
DECLARE_INSTRUCTION(StchInstruction)
DECLARE_INSTRUCTION(StfInstruction)
DECLARE_INSTRUCTION(StiInstruction)
DECLARE_INSTRUCTION(StlInstruction)
DECLARE_INSTRUCTION(StsInstruction)
DECLARE_INSTRUCTION(StswInstruction)
DECLARE_INSTRUCTION(SttInstruction)
DECLARE_INSTRUCTION(StxInstruction)

DECLARE_INSTRUCTION(SubInstruction)
DECLARE_INSTRUCTION(SubFInstruction)
DECLARE_INSTRUCTION(SubRInstruction)

DECLARE_INSTRUCTION(SvcInstruction)

DECLARE_INSTRUCTION(TdInstruction)
DECLARE_INSTRUCTION(TioInstruction)
DECLARE_INSTRUCTION(TixInstruction)
DECLARE_INSTRUCTION(TixRInstruction)

DECLARE_INSTRUCTION(WdInstruction)

#undef DECLARE_INSTRUCTION