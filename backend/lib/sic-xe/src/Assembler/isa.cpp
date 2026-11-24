#include "assembler/isa.hpp"

#include <array>
#include <unordered_map>

#include "InstructionTable.hpp"

namespace sicxe {
namespace {

using S = OperandSchema;

// The operand an instruction takes, as the assembler parses it.
constexpr OperandSchema schemaOf(const InstructionSpec& row) {
  if (hasFormat(row.formats, InstructionFormat::Format2)) {
    switch (row.operand_type) {
      case OperandType::Register: return S::Reg;                // CLEAR r1
      case OperandType::RegisterRegister: return S::RegReg;     // ADDR r1,r2
      case OperandType::RegisterImmediate: return S::RegCount;  // SHIFTL r1,n
      default: return S::Number;                                // SVC n
    }
  }
  return row.operand_type == OperandType::None ? S::None : S::Memory;
}

constexpr int formatOf(const InstructionSpec& row) {
  if (hasFormat(row.formats, InstructionFormat::Format1)) return 1;
  if (hasFormat(row.formats, InstructionFormat::Format2)) return 2;
  return 3;  // 3, promoted to 4 by '+'
}

constexpr auto kDefs = [] {
  std::array<InstructionDef, kInstructionCount> defs{};
  for (std::size_t i = 0; i < kInstructionCount; ++i) {
    const InstructionSpec& row = kInstructionTable[i];
    defs[i] = {row.mnemonic, row.opcode, formatOf(row), schemaOf(row), row.sic, row.executable};
  }
  return defs;
}();

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
      {"EQU", DirectiveKind::Equ},     {"ORG", DirectiveKind::Org},
      {"CSECT", DirectiveKind::Csect}, {"EXTDEF", DirectiveKind::Extdef},
      {"EXTREF", DirectiveKind::Extref}, {"ENTRY", DirectiveKind::Entry}};
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
