#pragma once
// Line parser: turns one source line into a structured Statement.
// No addresses, no symbol resolution, no encoding - those are the passes' job.

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "assembler/expression.hpp"
#include "assembler/diagnostics.hpp"
#include "assembler/isa.hpp"

namespace sicxe {

enum class AddrMode { Simple, Immediate, Indirect };

struct DataItem {            // one operand of BYTE / WORD
  bool isLiteral = false;    // C'..' / X'..'
  std::vector<byte_t> literal;
  ExprPtr expr;
};

struct Statement {
  // ---- source -----------------------------------------------------------
  int line = 0;
  std::string source;
  std::string label;  int labelCol = 0;
  std::string mnemonic;  int mnemonicCol = 0;  // upper-case, without '+'
  int operandCol = 0;
  bool extended = false;                       // '+' prefix
  const InstructionDef* inst = nullptr;
  std::optional<DirectiveKind> directive;

  // ---- parsed operands ----------------------------------------------------
  AddrMode mode = AddrMode::Simple;            // Memory schema
  bool indexed = false;
  ExprPtr expr;                                // memory operand / count / SVC / directive arg
  int reg1 = -1, reg2 = -1;
  std::vector<DataItem> items;                 // BYTE / WORD

  // ---- filled in by the passes ---------------------------------------------
  std::int64_t address = 0;
  std::int64_t size = 0;
  std::vector<byte_t> bytes;
  bool valid = true;                           // false once any error was reported
};

// nullopt for blank and comment-only lines.
// Comments: '.' in column 1 (full line) or ';' anywhere outside a quoted literal.
std::optional<Statement> parseLine(std::string_view text, int lineNo, Diagnostics& diags);

}  // namespace sicxe
