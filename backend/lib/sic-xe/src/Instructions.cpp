#include "Instructions.hpp"

#include "DecodedInstruction.hpp"
#include "memory/MemoryAccessor.hpp"
#include "memory/RegisterAccessor.hpp"
#include "operands/AddressOperand.hpp"
#include "operands/ValueOperand.hpp"

#define DEFINE_INSTRUCTION(__name, __operand)                                                      \
    bool __name::execute(ExecutionContext& context, __operand operand) const {                     \
        throw UnimplementedInstruction(#__name " | " #__operand);                                  \
    }

bool AddInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    context.registers.write("A", context.registers.read("A") + operand.value);

    return true;
}

bool StchInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    std::vector<byte_t> buf = {static_cast<byte_t>(context.registers.read("A") & 0xff)};
    context.memory.write(operand.address, buf);

    return true;
}

bool StsInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    uint64_t s = context.registers.read("S");

    std::vector<byte_t> buf = {static_cast<byte_t>(s & 0xff),
                               static_cast<byte_t>(s & (0xff << 8)),
                               static_cast<byte_t>(s & (0xff << 16))};

    context.memory.write(operand.address, buf);

    return true;
}

// DEFINE_INSTRUCTION(StsInstruction)

DEFINE_INSTRUCTION(AddFInstruction, FloatOperand)
DEFINE_INSTRUCTION(AddRInstruction, RegistersOperand)

DEFINE_INSTRUCTION(AndInstruction, ValueOperand)

DEFINE_INSTRUCTION(ClearInstruction, RegisterOperand)

DEFINE_INSTRUCTION(CompInstruction, ValueOperand)
DEFINE_INSTRUCTION(CompFInstruction, ValueOperand)
DEFINE_INSTRUCTION(CompRInstruction, RegistersOperand)

DEFINE_INSTRUCTION(DivInstruction, ValueOperand)
DEFINE_INSTRUCTION(DivFInstruction, ValueOperand)
DEFINE_INSTRUCTION(DivRInstruction, RegistersOperand)

DEFINE_INSTRUCTION(FixInstruction, NoneOperand)
DEFINE_INSTRUCTION(FloatInstruction, NoneOperand)

DEFINE_INSTRUCTION(HioInstruction, NoneOperand)

DEFINE_INSTRUCTION(JInstruction, AddressOperand)
DEFINE_INSTRUCTION(JeqInstruction, AddressOperand)
DEFINE_INSTRUCTION(JgtInstruction, AddressOperand)
DEFINE_INSTRUCTION(JltInstruction, AddressOperand)
DEFINE_INSTRUCTION(JsubInstruction, AddressOperand)

DEFINE_INSTRUCTION(LdaInstruction, ValueOperand)
DEFINE_INSTRUCTION(LdbInstruction, ValueOperand)
DEFINE_INSTRUCTION(LdchInstruction, ValueOperand)
DEFINE_INSTRUCTION(LdfInstruction, ValueOperand)
DEFINE_INSTRUCTION(LdlInstruction, ValueOperand)
DEFINE_INSTRUCTION(LdsInstruction, ValueOperand)
DEFINE_INSTRUCTION(LdtInstruction, ValueOperand)
DEFINE_INSTRUCTION(LdxInstruction, ValueOperand)
DEFINE_INSTRUCTION(LpsInstruction, AddressOperand)

DEFINE_INSTRUCTION(MulInstruction, ValueOperand)
DEFINE_INSTRUCTION(MulFInstruction, ValueOperand)
DEFINE_INSTRUCTION(MulRInstruction, RegistersOperand)

DEFINE_INSTRUCTION(NormInstruction, NoneOperand)

DEFINE_INSTRUCTION(OrInstruction, ValueOperand)

DEFINE_INSTRUCTION(RdInstruction, ValueOperand)

DEFINE_INSTRUCTION(RmoInstruction, RegistersOperand)

DEFINE_INSTRUCTION(RsubInstruction, NoneOperand)

DEFINE_INSTRUCTION(ShiftLInstruction, RegisterValueOperand)
DEFINE_INSTRUCTION(ShiftRInstruction, RegisterValueOperand)

DEFINE_INSTRUCTION(SioInstruction, NoneOperand)
DEFINE_INSTRUCTION(SskInstruction, AddressOperand)

DEFINE_INSTRUCTION(StaInstruction, AddressOperand)
DEFINE_INSTRUCTION(StbInstruction, AddressOperand)
DEFINE_INSTRUCTION(StfInstruction, AddressOperand)
DEFINE_INSTRUCTION(StiInstruction, AddressOperand)
DEFINE_INSTRUCTION(StlInstruction, AddressOperand)
DEFINE_INSTRUCTION(StswInstruction, AddressOperand)
DEFINE_INSTRUCTION(SttInstruction, AddressOperand)
DEFINE_INSTRUCTION(StxInstruction, AddressOperand)

DEFINE_INSTRUCTION(SubInstruction, ValueOperand)
DEFINE_INSTRUCTION(SubFInstruction, ValueOperand)
DEFINE_INSTRUCTION(SubRInstruction, RegistersOperand)

DEFINE_INSTRUCTION(TdInstruction, ValueOperand)
DEFINE_INSTRUCTION(TioInstruction, NoneOperand)
DEFINE_INSTRUCTION(TixInstruction, ValueOperand)
DEFINE_INSTRUCTION(TixRInstruction, RegisterOperand)

DEFINE_INSTRUCTION(WdInstruction, ValueOperand)

#undef DEFINE_INSTRUCTION
