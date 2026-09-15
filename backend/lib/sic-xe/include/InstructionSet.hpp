#pragma once

#include "architecture/InstructionDescription.hpp"

#include "Instructions.hpp"

#include <vector>

class InstructionSet
{
public:
    InstructionSet();

    [[nodiscard]]
    const std::vector<InstructionDescription>& descriptions() const noexcept;

    [[nodiscard]]
    const InstructionDescription* findByOpcode(
        std::uint8_t opcode
    ) const noexcept;

    [[nodiscard]]
    const InstructionDescription* findByMnemonic(
        const std::string& mnemonic
    ) const noexcept;

private:
    AddInstruction add_;
    AddFInstruction addf_;
    AddRInstruction addr_;

    AndInstruction and_;

    ClearInstruction clear_;

    CompInstruction comp_;
    CompFInstruction compf_;
    CompRInstruction compr_;

    DivInstruction div_;
    DivFInstruction divf_;
    DivRInstruction divr_;

    FixInstruction fix_;
    FloatInstruction float_;

    HioInstruction hio_;

    JInstruction j_;
    JeqInstruction jeq_;
    JgtInstruction jgt_;
    JltInstruction jlt_;
    JsubInstruction jsub_;

    LdaInstruction lda_;
    LdbInstruction ldb_;
    LdchInstruction ldch_;
    LdfInstruction ldf_;
    LdlInstruction ldl_;
    LdsInstruction lds_;
    LdtInstruction ldt_;
    LdxInstruction ldx_;
    LpsInstruction lps_;

    MulInstruction mul_;
    MulFInstruction mulf_;
    MulRInstruction mulr_;

    NormInstruction norm_;

    OrInstruction or_;

    RdInstruction rd_;

    RmoInstruction rmo_;

    RsubInstruction rsub_;

    ShiftLInstruction shiftl_;
    ShiftRInstruction shiftr_;

    SioInstruction sio_;
    SskInstruction ssk_;

    StaInstruction sta_;
    StbInstruction stb_;
    StchInstruction stch_;
    StfInstruction stf_;
    StiInstruction sti_;
    StlInstruction stl_;
    StsInstruction sts_;
    StswInstruction stsw_;
    SttInstruction stt_;
    StxInstruction stx_;

    SubInstruction sub_;
    SubFInstruction subf_;
    SubRInstruction subr_;

    SvcInstruction svc_;

    TdInstruction td_;
    TioInstruction tio_;
    TixInstruction tix_;
    TixRInstruction tixr_;

    WdInstruction wd_;

    std::vector<InstructionDescription> descriptions_;
};