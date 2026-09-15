#include "InstructionSet.hpp"

InstructionSet::InstructionSet()
{
    descriptions_ = {
        {
            0,
            "ADD",
            0x18,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &add_
        },

        {
            1,
            "ADDF",
            0x58,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended | InstructionFlags::Floating,
            &addf_
        },

        {
            2,
            "ADDR",
            0x90,
            InstructionFormat::Format2,
            OperandType::RegisterRegister,
            InstructionFlags::Extended,
            &addr_
        },

        {
            3,
            "AND",
            0x40,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &and_
        },

        {
            4,
            "CLEAR",
            0xB4,
            InstructionFormat::Format2,
            OperandType::Register,
            InstructionFlags::Extended,
            &clear_
        },

        {
            5,
            "COMP",
            0x28,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::SetsCC,
            &comp_
        },

        {
            6,
            "COMPF",
            0x88,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended |
            InstructionFlags::Floating |
            InstructionFlags::SetsCC,
            &compf_
        },

        {
            7,
            "COMPR",
            0xA0,
            InstructionFormat::Format2,
            OperandType::RegisterRegister,
            InstructionFlags::Extended |
            InstructionFlags::SetsCC,
            &compr_
        },

        {
            8,
            "DIV",
            0x24,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &div_
        },

        {
            9,
            "DIVF",
            0x64,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended |
            InstructionFlags::Floating,
            &divf_
        },

        {
            10,
            "DIVR",
            0x9C,
            InstructionFormat::Format2,
            OperandType::RegisterRegister,
            InstructionFlags::Extended,
            &divr_
        },

        {
            11,
            "FIX",
            0xC4,
            InstructionFormat::Format1,
            OperandType::None,
            InstructionFlags::Extended |
            InstructionFlags::Floating,
            &fix_
        },

        {
            12,
            "FLOAT",
            0xC0,
            InstructionFormat::Format1,
            OperandType::None,
            InstructionFlags::Extended |
            InstructionFlags::Floating,
            &float_
        },

        {
            13,
            "HIO",
            0xF4,
            InstructionFormat::Format1,
            OperandType::None,
            InstructionFlags::Privileged |
            InstructionFlags::Extended,
            &hio_
        },

        {
            14,
            "J",
            0x3C,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &j_
        },

        {
            15,
            "JEQ",
            0x30,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &jeq_
        },

        {
            16,
            "JGT",
            0x34,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &jgt_
        },

        {
            17,
            "JLT",
            0x38,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &jlt_
        },

        {
            18,
            "JSUB",
            0x48,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &jsub_
        },

        {
            19,
            "LDA",
            0x00,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &lda_
        },

        {
            20,
            "LDB",
            0x68,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended,
            &ldb_
        },

        {
            21,
            "LDCH",
            0x50,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &ldch_
        },

        {
            22,
            "LDF",
            0x70,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended |
            InstructionFlags::Floating,
            &ldf_
        },

        {
            23,
            "LDL",
            0x08,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &ldl_
        },

        {
            24,
            "LDS",
            0x6C,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended,
            &lds_
        },

        {
            25,
            "LDT",
            0x74,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended,
            &ldt_
        },

        {
            26,
            "LDX",
            0x04,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &ldx_
        },

        {
            27,
            "LPS",
            0xD0,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Privileged |
            InstructionFlags::Extended,
            &lps_
        },

        {
            28,
            "MUL",
            0x20,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &mul_
        },

        {
            29,
            "MULF",
            0x60,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended |
            InstructionFlags::Floating,
            &mulf_
        },

        {
            30,
            "MULR",
            0x98,
            InstructionFormat::Format2,
            OperandType::RegisterRegister,
            InstructionFlags::Extended,
            &mulr_
        },

        {
            31,
            "NORM",
            0xC8,
            InstructionFormat::Format1,
            OperandType::None,
            InstructionFlags::Extended |
            InstructionFlags::Floating,
            &norm_
        },

        {
            32,
            "OR",
            0x44,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &or_
        },

        {
            33,
            "RD",
            0xD8,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Privileged,
            &rd_
        },

        {
            34,
            "RMO",
            0xAC,
            InstructionFormat::Format2,
            OperandType::RegisterRegister,
            InstructionFlags::Extended,
            &rmo_
        },

        {
            35,
            "RSUB",
            0x4C,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::None,
            InstructionFlags::None,
            &rsub_
        },

        {
            36,
            "SHIFTL",
            0xA4,
            InstructionFormat::Format2,
            OperandType::RegisterImmediate,
            InstructionFlags::Extended,
            &shiftl_
        },

        {
            37,
            "SHIFTR",
            0xA8,
            InstructionFormat::Format2,
            OperandType::RegisterImmediate,
            InstructionFlags::Extended,
            &shiftr_
        },

        {
            38,
            "SIO",
            0xF0,
            InstructionFormat::Format1,
            OperandType::None,
            InstructionFlags::Privileged |
            InstructionFlags::Extended,
            &sio_
        },

        {
            39,
            "SSK",
            0xEC,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Privileged |
            InstructionFlags::Extended,
            &ssk_
        },

        {
            40,
            "STA",
            0x0C,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &sta_
        },

        {
            41,
            "STB",
            0x78,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended,
            &stb_
        },

        {
            42,
            "STCH",
            0x54,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &stch_
        },

        {
            43,
            "STF",
            0x80,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended |
            InstructionFlags::Floating,
            &stf_
        },

        {
            44,
            "STI",
            0xD4,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Privileged |
            InstructionFlags::Extended,
            &sti_
        },

        {
            45,
            "STL",
            0x14,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &stl_
        },

        {
            46,
            "STS",
            0x7C,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended,
            &sts_
        },

        {
            47,
            "STSW",
            0xE8,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Privileged,
            &stsw_
        },

        {
            48,
            "STT",
            0x84,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended,
            &stt_
        },

        {
            49,
            "STX",
            0x10,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &stx_
        },

        {
            50,
            "SUB",
            0x1C,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::None,
            &sub_
        },

        {
            51,
            "SUBF",
            0x5C,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Extended |
            InstructionFlags::Floating,
            &subf_
        },

        {
            52,
            "SUBR",
            0x94,
            InstructionFormat::Format2,
            OperandType::RegisterRegister,
            InstructionFlags::Extended,
            &subr_
        },

        {
            53,
            "SVC",
            0xB0,
            InstructionFormat::Format2,
            OperandType::RegisterImmediate,
            InstructionFlags::Extended,
            &svc_
        },

        {
            54,
            "TD",
            0xE0,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Privileged |
            InstructionFlags::SetsCC,
            &td_
        },

        {
            55,
            "TIO",
            0xF8,
            InstructionFormat::Format1,
            OperandType::None,
            InstructionFlags::Privileged |
            InstructionFlags::Extended |
            InstructionFlags::SetsCC,
            &tio_
        },

        {
            56,
            "TIX",
            0x2C,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::SetsCC,
            &tix_
        },

        {
            57,
            "TIXR",
            0xB8,
            InstructionFormat::Format2,
            OperandType::Register,
            InstructionFlags::Extended |
            InstructionFlags::SetsCC,
            &tixr_
        },

        {
            58,
            "WD",
            0xDC,
            InstructionFormat::Format3 | InstructionFormat::Format4,
            OperandType::Memory,
            InstructionFlags::Privileged,
            &wd_
        }
    };
}

const std::vector<InstructionDescription>&
InstructionSet::descriptions() const noexcept
{
    return descriptions_;
}

const InstructionDescription*
InstructionSet::findByOpcode(std::uint8_t opcode) const noexcept
{
    for (const auto& instruction : descriptions_) {
        if (instruction.opcode == opcode) {
            return &instruction;
        }
    }

    return nullptr;
}
