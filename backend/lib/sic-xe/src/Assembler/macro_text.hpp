#pragma once
// Text helpers of the macro processor (private to macro_processor.cpp): the field and
// comment rules of parser.cpp, stored body lines as pieces, and the prototype rule.

#include <cstddef>
#include <functional>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace sicxe::macro_text {

// ---- text helpers (same field and comment rules as parser.cpp) -------------

std::string toUpper(std::string_view s);
bool isSpace(char c);
bool isIdentifier(std::string_view s);
std::string_view trim(std::string_view s);
std::string_view withoutCr(std::string_view line);

// '+' prefix and ",x" suffix removed, as the parser does before looking a mnemonic up.
std::string_view operationMnemonic(std::string_view op);

// Code part of a line: a '.' in column 1 makes the whole line a comment, and ';'
// outside quotes starts one. Any apostrophe toggles the quoted state.
std::string_view codeOf(std::string_view line);

struct Token {
  std::string_view text;
  std::size_t offset = 0;
};

// Next whitespace-delimited token from pos; empty text at the end.
Token nextToken(std::string_view s, std::size_t& pos);

// Comma-separated items outside quotes, each trimmed; an empty list has none.
std::vector<Token> splitList(std::string_view list);

// ---- stored body ------------------------------------------------------------

// A stored body line is a sequence of pieces, never text with '#' markers, so a
// user-written "#1" cannot be mistaken for a parameter (Review Focus 1).
// Param levels count from the definition that stores the line (1); expanding it
// turns Param{1,i} into actual i and Param{k,i} into Param{k-1,i}.
struct Piece {
  enum class Kind { Text, Param, Serial };
  Kind kind = Kind::Text;
  std::string text;  // Text
  int level = 0;     // Param
  int index = 0;     // Param: 0 = label formal, 1..n = formals
};
using PieceLine = std::vector<Piece>;

PieceLine textLine(std::string_view text);

// Display form (spec 4.4): markers as "#i", or "#(d,i)" in a definition with nested definitions.
std::string displayForm(const PieceLine& line, bool nested);

// A stored line read from an expansion (spec 4.4): Param{1,i} becomes actual i, and
// Param{k,i} becomes Param{k-1,i}, because the definitions nested in the body are one
// level shallower once it is expanded. Serial stays: it is replaced only when the line
// goes to the output.
PieceLine substitute(const PieceLine& line, const std::vector<std::string>& actuals);

// An expanded line as it goes to the output. A marker can only be left inside a nested
// definition, and it keeps its display form.
std::string outputText(const PieceLine& line, int serial);

// Finds the formal a word refers to; `offset` is the word's position in the line.
using FormalLookup = std::function<std::optional<Piece>(std::string_view word, std::size_t offset)>;

// Identifier tokens outside quotes and comments become Param when `lookup` finds them,
// except right after '$' (a register) and the C/X of a C'..' / X'..' literal.
// ".NAME" of a formal drops the dot; ".SER" is the system formal.
PieceLine toPieces(std::string_view line, const FormalLookup& lookup);

// ---- prototype ----------------------------------------------------------------

struct PrototypeFormal {
  std::string name;
  std::size_t offset = 0;
  std::optional<std::string> defaultValue;
};

struct Prototype {
  std::string label;  // "" = no label formal
  std::size_t labelOffset = 0;
  std::string name;
  std::size_t nameOffset = 0;
  std::vector<PrototypeFormal> formals;
};

// Spec 4.1 structural rule, independent of columns. `code` has its comment removed.
Prototype parsePrototype(std::string_view code);

}  // namespace sicxe::macro_text
