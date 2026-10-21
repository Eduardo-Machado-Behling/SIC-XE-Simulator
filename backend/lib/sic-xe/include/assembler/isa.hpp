#pragma once
// Single source of truth for the instruction set: one InstructionDef per
// mnemonic describes opcode, format, operand schema and SIC availability.

#include <optional>
#include <span>
#include <string_view>

#include "memory/CodeMemory.hpp"

namespace sicxe {

enum class OperandSchema {
  None,      // FIX, RSUB, ...
  Memory,    // LDA m, LDA #m, LDA @m, LDA m,$X
  Reg,       // CLEAR $r, TIX $r
  RegReg,    // ADD $r1,$r2
  RegCount,  // SHIFTL $r,n   (n in 1..16)
  Number     // SVC n        (n in 0..15)
};

struct InstructionDef {
  std::string_view mnemonic;
  byte_t opcode;           // 8-bit opcode; for format 3/4 the low two bits are zero
  int format;              // 1, 2 or 3 (3 may be promoted to 4 with '+')
  OperandSchema schema;
  bool sic;                // exists in the original SIC instruction set
  bool allowsExtended() const { return format == 3 && schema == OperandSchema::Memory; }
};

enum class DirectiveKind { Start, End, Byte, Word, Resb, Resw, Base, Nobase, Equ, Org };

// Lookups take UPPER-CASE names.
const InstructionDef* findInstruction(std::string_view upper);
std::span<const InstructionDef> instructionSet();
std::optional<DirectiveKind> findDirective(std::string_view upper);
std::optional<int> registerNumber(std::string_view upper);

}  // namespace sicxe
