#pragma once

#include <vector>

#include "Instructions.hpp"
#include "architecture/InstructionDescription.hpp"

struct InstructionData {
    InstructionDescription description;
    IInstruction* implementation;
};

class InstructionSet {
public:
    InstructionSet();

    [[nodiscard]]
    const std::vector<InstructionDescription> descriptions() const noexcept;

    [[nodiscard]]
    const InstructionData* findByOpcode(std::uint8_t opcode) const noexcept;

    [[nodiscard]]
    const InstructionData* findByMnemonic(const std::string& mnemonic) const noexcept;

private:
    AddInstruction m_add;
    AddFInstruction m_addf;
    AddRInstruction m_addr;

    AndInstruction m_and;

    ClearInstruction m_clear;

    CompInstruction m_comp;
    CompFInstruction m_compf;
    CompRInstruction m_compr;

    DivInstruction m_div;
    DivFInstruction m_divf;
    DivRInstruction m_divr;

    FixInstruction m_fix;
    FloatInstruction m_float;

    HioInstruction m_hio;
    HaltInstruction m_halt;

    JInstruction m_j;
    JeqInstruction m_jeq;
    JgtInstruction m_jgt;
    JltInstruction m_jlt;
    JsubInstruction m_jsub;

    LdaInstruction m_lda;
    LdbInstruction m_ldb;
    LdchInstruction m_ldch;
    LdfInstruction m_ldf;
    LdlInstruction m_ldl;
    LdsInstruction m_lds;
    LdtInstruction m_ldt;
    LdxInstruction m_ldx;
    LpsInstruction m_lps;

    MulInstruction m_mul;
    MulFInstruction m_mulf;
    MulRInstruction m_mulr;

    NormInstruction m_norm;

    OrInstruction m_or;

    RdInstruction m_rd;

    RmoInstruction m_rmo;

    RsubInstruction m_rsub;

    ShiftLInstruction m_shiftl;
    ShiftRInstruction m_shiftr;

    SioInstruction m_sio;
    SskInstruction m_ssk;

    StaInstruction m_sta;
    StbInstruction m_stb;
    StchInstruction m_stch;
    StfInstruction m_stf;
    StiInstruction m_sti;
    StlInstruction m_stl;
    StsInstruction m_sts;
    StswInstruction m_stsw;
    SttInstruction m_stt;
    StxInstruction m_stx;

    SubInstruction m_sub;
    SubFInstruction m_subf;
    SubRInstruction m_subr;

    // SvcInstruction m_svc;

    TdInstruction m_td;
    TioInstruction m_tio;
    TixInstruction m_tix;
    TixRInstruction m_tixr;

    WdInstruction m_wd;

    std::vector<InstructionData> m_descriptions;
};
