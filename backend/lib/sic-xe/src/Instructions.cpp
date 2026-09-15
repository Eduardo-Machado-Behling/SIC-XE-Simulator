#include "Instructions.hpp"

#include "DecodedInstruction.hpp"
#include "architecture/CPUState.hpp"
#include "memory/MemoryAccessor.hpp"

#define DEFINE_INSTRUCTION(name) \
void name::execute(ExecutionContext& context) const \
{ \
    throw UnimplementedInstruction(#name);\
}

void AddInstruction::execute(ExecutionContext& context) const 
{ 
    context.state.write("A", context.state.read("A") + context.instruction.immediate);
}

DEFINE_INSTRUCTION(AddFInstruction)
DEFINE_INSTRUCTION(AddRInstruction)
DEFINE_INSTRUCTION(AndInstruction)
DEFINE_INSTRUCTION(ClearInstruction)
DEFINE_INSTRUCTION(CompInstruction)
DEFINE_INSTRUCTION(CompFInstruction)
DEFINE_INSTRUCTION(CompRInstruction)
DEFINE_INSTRUCTION(DivInstruction)
DEFINE_INSTRUCTION(DivFInstruction)
DEFINE_INSTRUCTION(DivRInstruction)
DEFINE_INSTRUCTION(FixInstruction)
DEFINE_INSTRUCTION(FloatInstruction)
DEFINE_INSTRUCTION(HioInstruction)
DEFINE_INSTRUCTION(JInstruction)
DEFINE_INSTRUCTION(JeqInstruction)
DEFINE_INSTRUCTION(JgtInstruction)
DEFINE_INSTRUCTION(JltInstruction)
DEFINE_INSTRUCTION(JsubInstruction)
DEFINE_INSTRUCTION(LdaInstruction)
DEFINE_INSTRUCTION(LdbInstruction)
DEFINE_INSTRUCTION(LdchInstruction)
DEFINE_INSTRUCTION(LdfInstruction)
DEFINE_INSTRUCTION(LdlInstruction)
DEFINE_INSTRUCTION(LdsInstruction)
DEFINE_INSTRUCTION(LdtInstruction)
DEFINE_INSTRUCTION(LdxInstruction)
DEFINE_INSTRUCTION(LpsInstruction)
DEFINE_INSTRUCTION(MulInstruction)
DEFINE_INSTRUCTION(MulFInstruction)
DEFINE_INSTRUCTION(MulRInstruction)
DEFINE_INSTRUCTION(NormInstruction)
DEFINE_INSTRUCTION(OrInstruction)
DEFINE_INSTRUCTION(RdInstruction)
DEFINE_INSTRUCTION(RmoInstruction)
DEFINE_INSTRUCTION(RsubInstruction)
DEFINE_INSTRUCTION(ShiftLInstruction)
DEFINE_INSTRUCTION(ShiftRInstruction)
DEFINE_INSTRUCTION(SioInstruction)
DEFINE_INSTRUCTION(SskInstruction)
DEFINE_INSTRUCTION(StaInstruction)
DEFINE_INSTRUCTION(StbInstruction)
DEFINE_INSTRUCTION(StchInstruction)
DEFINE_INSTRUCTION(StfInstruction)
DEFINE_INSTRUCTION(StiInstruction)
DEFINE_INSTRUCTION(StlInstruction)
DEFINE_INSTRUCTION(StsInstruction)
DEFINE_INSTRUCTION(StswInstruction)
DEFINE_INSTRUCTION(SttInstruction)
DEFINE_INSTRUCTION(StxInstruction)
DEFINE_INSTRUCTION(SubInstruction)
DEFINE_INSTRUCTION(SubFInstruction)
DEFINE_INSTRUCTION(SubRInstruction)
DEFINE_INSTRUCTION(SvcInstruction)
DEFINE_INSTRUCTION(TdInstruction)
DEFINE_INSTRUCTION(TioInstruction)
DEFINE_INSTRUCTION(TixInstruction)
DEFINE_INSTRUCTION(TixRInstruction)
DEFINE_INSTRUCTION(WdInstruction)

#undef DEFINE_INSTRUCTION