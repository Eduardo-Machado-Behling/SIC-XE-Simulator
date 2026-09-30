#pragma once

#include "IInstruction.hpp"

#include "operands/FloatOperand.hpp"
#include "operands/NoneOperand.hpp"
#include "operands/RegisterOperand.hpp"
#include "operands/RegisterValueOperand.hpp"
#include "operands/RegistersOperand.hpp"
#include "operands/ValueOperand.hpp"

#define DECLARE_INSTRUCTION(__name, __operand)                                                     \
    class __name final : public IInstruction {                                                     \
    public:                                                                                        \
        bool execute(ExecutionContext& context, __operand operand) const override;                 \
    };

DECLARE_INSTRUCTION(AddInstruction, ValueOperand)
DECLARE_INSTRUCTION(AddFInstruction, FloatOperand)
DECLARE_INSTRUCTION(AddRInstruction, RegistersOperand)

DECLARE_INSTRUCTION(AndInstruction, ValueOperand)

DECLARE_INSTRUCTION(ClearInstruction, RegisterOperand)

DECLARE_INSTRUCTION(CompInstruction, ValueOperand)
DECLARE_INSTRUCTION(CompFInstruction, FloatOperand)
DECLARE_INSTRUCTION(CompRInstruction, RegistersOperand)

DECLARE_INSTRUCTION(DivInstruction, ValueOperand)
DECLARE_INSTRUCTION(DivFInstruction, FloatOperand)
DECLARE_INSTRUCTION(DivRInstruction, RegistersOperand)

DECLARE_INSTRUCTION(FixInstruction, NoneOperand)
DECLARE_INSTRUCTION(FloatInstruction, NoneOperand)

DECLARE_INSTRUCTION(HioInstruction, NoneOperand)

DECLARE_INSTRUCTION(JInstruction, AddressOperand)
DECLARE_INSTRUCTION(JeqInstruction, AddressOperand)
DECLARE_INSTRUCTION(JgtInstruction, AddressOperand)
DECLARE_INSTRUCTION(JltInstruction, AddressOperand)
DECLARE_INSTRUCTION(JsubInstruction, AddressOperand)

DECLARE_INSTRUCTION(LdaInstruction, ValueOperand)
DECLARE_INSTRUCTION(LdbInstruction, ValueOperand)
DECLARE_INSTRUCTION(LdchInstruction, ValueOperand)
DECLARE_INSTRUCTION(LdfInstruction, ValueOperand)
DECLARE_INSTRUCTION(LdlInstruction, ValueOperand)
DECLARE_INSTRUCTION(LdsInstruction, ValueOperand)
DECLARE_INSTRUCTION(LdtInstruction, ValueOperand)
DECLARE_INSTRUCTION(LdxInstruction, ValueOperand)
DECLARE_INSTRUCTION(LpsInstruction, AddressOperand)

DECLARE_INSTRUCTION(MulInstruction, ValueOperand)
DECLARE_INSTRUCTION(MulFInstruction, ValueOperand)
DECLARE_INSTRUCTION(MulRInstruction, RegistersOperand)

DECLARE_INSTRUCTION(NormInstruction, NoneOperand)

DECLARE_INSTRUCTION(OrInstruction, ValueOperand)

DECLARE_INSTRUCTION(RdInstruction, ValueOperand)

DECLARE_INSTRUCTION(RmoInstruction, RegistersOperand)

DECLARE_INSTRUCTION(RsubInstruction, NoneOperand)

DECLARE_INSTRUCTION(ShiftLInstruction, RegisterValueOperand)
DECLARE_INSTRUCTION(ShiftRInstruction, RegisterValueOperand)

DECLARE_INSTRUCTION(SioInstruction, NoneOperand)
DECLARE_INSTRUCTION(SskInstruction, AddressOperand)

DECLARE_INSTRUCTION(StaInstruction, AddressOperand)
DECLARE_INSTRUCTION(StbInstruction, AddressOperand)
DECLARE_INSTRUCTION(StchInstruction, AddressOperand)
DECLARE_INSTRUCTION(StfInstruction, AddressOperand)
DECLARE_INSTRUCTION(StiInstruction, AddressOperand)
DECLARE_INSTRUCTION(StlInstruction, AddressOperand)
DECLARE_INSTRUCTION(StsInstruction, AddressOperand)
DECLARE_INSTRUCTION(StswInstruction, AddressOperand)
DECLARE_INSTRUCTION(SttInstruction, AddressOperand)
DECLARE_INSTRUCTION(StxInstruction, AddressOperand)

DECLARE_INSTRUCTION(SubInstruction, ValueOperand)
DECLARE_INSTRUCTION(SubFInstruction, ValueOperand)
DECLARE_INSTRUCTION(SubRInstruction, RegistersOperand)

// TODO:
//DECLARE_INSTRUCTION(SvcInstruction, ServiceNumberOperand)

DECLARE_INSTRUCTION(TdInstruction, ValueOperand)
DECLARE_INSTRUCTION(TioInstruction, NoneOperand)
DECLARE_INSTRUCTION(TixInstruction, ValueOperand)
DECLARE_INSTRUCTION(TixRInstruction, RegisterOperand)

DECLARE_INSTRUCTION(WdInstruction, ValueOperand)

#undef DECLARE_INSTRUCTION
