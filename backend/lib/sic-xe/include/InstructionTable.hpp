#pragma once

#include <cstddef>
#include <cstdint>
#include <iterator>
#include <string_view>

#include "architecture/InstructionDescription.hpp"

// The SIC/XE instruction table: the single source of truth for every instruction.
// InstructionSet binds an implementation to each row; the assembler and the
// language server derive their encodings from it. Header-only on purpose: the
// assembler library links without the CPU library.
struct InstructionSpec {
    std::string_view mnemonic;
    std::uint8_t opcode;
    InstructionFormat formats;
    OperandType operand_type;
    InstructionFlags flags;
    bool sic;        // in the original SIC instruction set (accepted in SIC mode)
    bool executable; // the CPU runs it; false: it assembles but fails when executed
};

// The row index is the InstructionId sent to clients: append rows, never reorder.
inline constexpr InstructionSpec kInstructionTable[] = {
    {"ADD", 0x18, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, true},
    {"ADDF", 0x58, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::Floating, false, false},
    {"ADDR", 0x90, InstructionFormat::Format2, OperandType::RegisterRegister, InstructionFlags::None, false, true},
    {"AND", 0x40, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, true},
    {"CLEAR", 0xB4, InstructionFormat::Format2, OperandType::Register, InstructionFlags::None, false, true},
    {"COMP", 0x28, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::SetsCC, true, true},
    {"COMPF", 0x88, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::Floating | InstructionFlags::SetsCC, false, false},
    {"COMPR", 0xA0, InstructionFormat::Format2, OperandType::RegisterRegister, InstructionFlags::SetsCC, false, true},
    {"DIV", 0x24, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, true},
    {"DIVF", 0x64, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::Floating, false, false},
    {"DIVR", 0x9C, InstructionFormat::Format2, OperandType::RegisterRegister, InstructionFlags::None, false, true},
    {"FIX", 0xC4, InstructionFormat::Format1, OperandType::None, InstructionFlags::None, false, false},
    {"FLOAT", 0xC0, InstructionFormat::Format1, OperandType::None, InstructionFlags::Floating, false, false},
    {"HIO", 0xF4, InstructionFormat::Format1, OperandType::None, InstructionFlags::Privileged, false, false},
    {"J", 0x3C, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, true, true},
    {"JEQ", 0x30, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, true, true},
    {"JGT", 0x34, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, true, true},
    {"JLT", 0x38, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, true, true},
    {"JSUB", 0x48, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, true, true},
    {"LDA", 0x00, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, true},
    {"LDB", 0x68, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, false, true},
    {"LDCH", 0x50, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, true},
    {"LDF", 0x70, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::Floating, false, false},
    {"LDL", 0x08, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, true},
    {"LDS", 0x6C, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, false, true},
    {"LDT", 0x74, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, false, true},
    {"LDX", 0x04, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, true},
    {"LPS", 0xD0, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::Privileged, false, false},
    {"MUL", 0x20, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, true},
    {"MULF", 0x60, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::Floating, false, false},
    {"MULR", 0x98, InstructionFormat::Format2, OperandType::RegisterRegister, InstructionFlags::None, false, true},
    {"NORM", 0xC8, InstructionFormat::Format1, OperandType::None, InstructionFlags::Floating, false, false},
    {"OR", 0x44, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, true},
    {"RD", 0xD8, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, false},
    {"RMO", 0xAC, InstructionFormat::Format2, OperandType::RegisterRegister, InstructionFlags::None, false, true},
    {"RSUB", 0x4C, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::None, InstructionFlags::None, true, true},
    {"SHIFTL", 0xA4, InstructionFormat::Format2, OperandType::RegisterImmediate, InstructionFlags::None, false, true},
    {"SHIFTR", 0xA8, InstructionFormat::Format2, OperandType::RegisterImmediate, InstructionFlags::None, false, true},
    {"SIO", 0xF0, InstructionFormat::Format1, OperandType::None, InstructionFlags::Privileged, false, false},
    {"SSK", 0xEC, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::Privileged, false, false},
    {"STA", 0x0C, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, true, true},
    {"STB", 0x78, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, false, true},
    {"STCH", 0x54, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, true, true},
    {"STF", 0x80, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::Floating, false, false},
    {"STI", 0xD4, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, false, false},
    {"STL", 0x14, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, true, true},
    {"STS", 0x7C, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, false, true},
    {"STSW", 0xE8, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, true, false},
    {"STT", 0x84, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, false, true},
    {"STX", 0x10, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Address, InstructionFlags::None, true, true},
    {"SUB", 0x1C, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, true},
    {"SUBF", 0x5C, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::Floating, false, false},
    {"SUBR", 0x94, InstructionFormat::Format2, OperandType::RegisterRegister, InstructionFlags::None, false, true},
    // No CPU implementation: it assembles, and running it stops with "Unknown opcode".
    {"SVC", 0xB0, InstructionFormat::Format2, OperandType::Value, InstructionFlags::None, false, false},
    {"TD", 0xE0, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::SetsCC, true, false},
    {"TIO", 0xF8, InstructionFormat::Format1, OperandType::None, InstructionFlags::Privileged, false, false},
    {"TIX", 0x2C, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::SetsCC, true, true},
    {"TIXR", 0xB8, InstructionFormat::Format2, OperandType::Register, InstructionFlags::SetsCC, false, true},
    {"WD", 0xDC, InstructionFormat::Format3 | InstructionFormat::Format4, OperandType::Value, InstructionFlags::None, true, false},
    // Simulator extension; 0xFC is not assigned in the SIC/XE instruction table.
    {"HALT", 0xFC, InstructionFormat::Format1, OperandType::None, InstructionFlags::None, false, true},
};

inline constexpr std::size_t kInstructionCount = std::size(kInstructionTable);
