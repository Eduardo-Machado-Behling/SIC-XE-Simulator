#pragma once
// Expression AST, parser and evaluator.
//
//   expr    := term (('+'|'-') term)*
//   term    := unary (('*'|'/') unary)*
//   unary   := ('+'|'-') unary | primary
//   primary := number | symbol | '*' | '(' expr ')'
//
// '*' in operand position is the current location counter. Numbers are
// decimal or 0x-prefixed hexadecimal.
//
// Each value carries a "relocation degree": labels and '*' have degree 1,
// constants 0. A+B = degrees add, A-B subtract, so (END-START) is absolute (0)
// and (START+4) is relocatable (1). Anything other than 0/1 is rejected.

#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "assembler/diagnostics.hpp"

namespace sicxe {

struct ExprNode;
using ExprPtr = std::shared_ptr<const ExprNode>;

struct ExprNode {
  enum class Kind { Number, Symbol, Location, Unary, Binary };
  Kind kind = Kind::Number;
  std::int64_t number = 0;
  std::string name;  // Symbol
  char op = 0;       // Unary / Binary
  ExprPtr lhs, rhs;
  int column = 0;    // for diagnostics
};

// One signed term that the assembler cannot fold into a number: an EXTREF symbol (value
// unknown, contributes 0), or `local`: a label of the section itself, which is relative to
// the section's start. Both become modification records, in source order (Beck Fig. 3.9).
struct Term {
  char sign = '+';
  std::string name;
  bool local = false;
};

struct Value {
  std::int64_t value = 0;
  int relocDegree = 0;
  std::vector<Term> terms;
  bool relocatable() const { return relocDegree != 0; }
  const Term* firstExternal() const {
    for (const Term& term : terms)
      if (!term.local) return &term;
    return nullptr;
  }
};

struct EvalContext {
  std::function<std::optional<Value>(const std::string&)> lookup;
  std::int64_t location = 0;
  std::string section;  // name of the control section that '*' is relative to
  bool forwardRefsAllowed = true;  // only affects the wording of the error
};

// Returns nullptr (after reporting) on a syntax error.
ExprPtr parseExpression(std::string_view text, int line, int column, Diagnostics& diags);

// Returns nullopt (after reporting) on undefined symbols, division by zero, etc.
std::optional<Value> evaluate(const ExprNode& expr, const EvalContext& ctx, int line,
                              Diagnostics& diags);

}  // namespace sicxe
