#include "assembler/isa.hpp"

#include <unordered_map>

namespace sicxe {
namespace {

using S = OperandSchema;

constexpr InstructionDef kDefs[] = {
    // ---- format 3/4 memory references ------------------------------------
    {"ADD", 0x18, 3, S::Memory, true},   {"ADDF", 0x58, 3, S::Memory, false},
    {"AND", 0x40, 3, S::Memory, true},   {"COMP", 0x28, 3, S::Memory, true},
    {"COMPF", 0x88, 3, S::Memory, false},{"DIV", 0x24, 3, S::Memory, true},
    {"DIVF", 0x64, 3, S::Memory, false}, {"J", 0x3C, 3, S::Memory, true},
    {"JEQ", 0x30, 3, S::Memory, true},   {"JGT", 0x34, 3, S::Memory, true},
    {"JLT", 0x38, 3, S::Memory, true},   {"JSUB", 0x48, 3, S::Memory, true},
    {"LDA", 0x00, 3, S::Memory, true},   {"LDB", 0x68, 3, S::Memory, false},
    {"LDCH", 0x50, 3, S::Memory, true},  {"LDF", 0x70, 3, S::Memory, false},
    {"LDL", 0x08, 3, S::Memory, true},   {"LDS", 0x6C, 3, S::Memory, false},
    {"LDT", 0x74, 3, S::Memory, false},  {"LDX", 0x04, 3, S::Memory, true},
    {"LPS", 0xD0, 3, S::Memory, false},  {"MUL", 0x20, 3, S::Memory, true},
    {"MULF", 0x60, 3, S::Memory, false}, {"OR", 0x44, 3, S::Memory, true},
    {"RD", 0xD8, 3, S::Memory, true},    {"SSK", 0xEC, 3, S::Memory, false},
    {"STA", 0x0C, 3, S::Memory, true},   {"STB", 0x78, 3, S::Memory, false},
    {"STCH", 0x54, 3, S::Memory, true},  {"STF", 0x80, 3, S::Memory, false},
    {"STI", 0xD4, 3, S::Memory, false},  {"STL", 0x14, 3, S::Memory, true},
    {"STS", 0x7C, 3, S::Memory, false},  {"STSW", 0xE8, 3, S::Memory, true},
    {"STT", 0x84, 3, S::Memory, false},  {"STX", 0x10, 3, S::Memory, true},
    {"SUB", 0x1C, 3, S::Memory, true},   {"SUBF", 0x5C, 3, S::Memory, false},
    {"TD", 0xE0, 3, S::Memory, true},    {"TIX", 0x2C, 3, S::Memory, true},
    {"WD", 0xDC, 3, S::Memory, true},
    // ---- format 3, no operand ---------------------------------------------
    {"RSUB", 0x4C, 3, S::None, true},
    // ---- format 2 -----------------------------------------------------------
    {"ADDR", 0x90, 2, S::RegReg, false}, {"CLEAR", 0xB4, 2, S::Reg, false},
    {"COMPR", 0xA0, 2, S::RegReg, false},{"DIVR", 0x9C, 2, S::RegReg, false},
    {"MULR", 0x98, 2, S::RegReg, false}, {"RMO", 0xAC, 2, S::RegReg, false},
    {"SHIFTL", 0xA4, 2, S::RegCount, false}, {"SHIFTR", 0xA8, 2, S::RegCount, false},
    {"SUBR", 0x94, 2, S::RegReg, false}, {"SVC", 0xB0, 2, S::Number, false},
    {"TIXR", 0xB8, 2, S::Reg, false},
    // ---- format 1 -----------------------------------------------------------
    {"FIX", 0xC4, 1, S::None, false},    {"FLOAT", 0xC0, 1, S::None, false},
    {"HALT", 0xFC, 1, S::None, false},   {"HIO", 0xF4, 1, S::None, false},
    {"NORM", 0xC8, 1, S::None, false},   {"SIO", 0xF0, 1, S::None, false},
    {"TIO", 0xF8, 1, S::None, false},
};

}  // namespace

const InstructionDef* findInstruction(std::string_view name) {
  static const auto table = [] {
    std::unordered_map<std::string_view, const InstructionDef*> m;
    for (const auto& d : kDefs) m.emplace(d.mnemonic, &d);
    return m;
  }();
  auto it = table.find(name);
  return it == table.end() ? nullptr : it->second;
}

std::span<const InstructionDef> instructionSet() {
  return kDefs;
}

std::optional<DirectiveKind> findDirective(std::string_view n) {
  static const std::unordered_map<std::string_view, DirectiveKind> table = {
      {"START", DirectiveKind::Start}, {"END", DirectiveKind::End},
      {"BYTE", DirectiveKind::Byte},   {"WORD", DirectiveKind::Word},
      {"RESB", DirectiveKind::Resb},   {"RESW", DirectiveKind::Resw},
      {"BASE", DirectiveKind::Base},   {"NOBASE", DirectiveKind::Nobase},
      {"EQU", DirectiveKind::Equ},     {"ORG", DirectiveKind::Org}};
  auto it = table.find(n);
  if (it == table.end()) return std::nullopt;
  return it->second;
}

std::optional<int> registerNumber(std::string_view n) {
  if (n == "A") return 0;
  if (n == "X") return 1;
  if (n == "L") return 2;
  if (n == "B") return 3;
  if (n == "S") return 4;
  if (n == "T") return 5;
  if (n == "F") return 6;
  if (n == "PC") return 8;
  if (n == "SW") return 9;
  return std::nullopt;
}

}  // namespace sicxe
