#include "assembler/parser.hpp"

#include <cctype>
#include <cstring>

namespace sicxe {
namespace {

std::string toUpper(std::string_view s) {
  std::string r(s);
  for (char& c : r) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  return r;
}

bool isIdentifier(std::string_view s) {
  if (s.empty() || !(std::isalpha(static_cast<unsigned char>(s[0])) || s[0] == '_')) return false;
  for (char c : s)
    if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '_')) return false;
  return true;
}

bool isSpace(char c) { return std::isspace(static_cast<unsigned char>(c)) != 0; }

std::string_view stripComment(std::string_view line) {
  bool inQuote = false;
  for (std::size_t i = 0; i < line.size(); ++i) {
    if (line[i] == '\'') inQuote = !inQuote;
    else if (line[i] == ';' && !inQuote) return line.substr(0, i);
  }
  return line;
}

struct Field { std::string text; int col; };

// Splits on commas that are outside C'..' / X'..' literals; trims each field.
std::vector<Field> splitOperands(std::string_view s, int baseCol) {
  std::vector<Field> out;
  if (s.empty()) return out;
  bool inQuote = false;
  std::size_t start = 0;
  auto push = [&](std::size_t b, std::size_t e) {
    while (b < e && isSpace(s[b])) ++b;
    while (e > b && isSpace(s[e - 1])) --e;
    out.push_back({std::string(s.substr(b, e - b)), baseCol + static_cast<int>(b)});
  };
  for (std::size_t i = 0; i < s.size(); ++i) {
    if (s[i] == '\'') inQuote = !inQuote;
    else if (s[i] == ',' && !inQuote) { push(start, i); start = i + 1; }
  }
  push(start, s.size());
  return out;
}

struct Ctx {
  Statement& st;
  const std::vector<Field>& f;
  Diagnostics& d;
};

void fail(Ctx& c, int col, const std::string& msg) {
  c.d.error(c.st.line, col, msg);
  c.st.valid = false;
}

bool arity(Ctx& c, std::size_t lo, std::size_t hi) {
  if (hi == 0 && !c.f.empty()) { fail(c, c.f[0].col, c.st.mnemonic + " takes no operands"); return false; }
  if (c.f.size() < lo) { fail(c, c.st.operandCol, "Missing operand for " + c.st.mnemonic); return false; }
  if (c.f.size() > hi) { fail(c, c.f[hi].col, "Too many operands for " + c.st.mnemonic); return false; }
  return true;
}

int parseRegister(Ctx& c, const Field& f) {
  if (auto r = registerNumber(toUpper(f.text))) return *r;
  fail(c, f.col, "Unknown register '" + f.text + "'");
  return -1;
}

ExprPtr parseExprField(Ctx& c, const Field& f) {
  ExprPtr e = parseExpression(f.text, c.st.line, f.col, c.d);
  if (!e) c.st.valid = false;
  return e;
}

void parseMemoryOperand(Ctx& c) {
  if (!arity(c, 1, 2)) return;
  std::string_view t = c.f[0].text;
  int col = c.f[0].col;
  if (!t.empty() && (t[0] == '#' || t[0] == '@')) {
    c.st.mode = t[0] == '#' ? AddrMode::Immediate : AddrMode::Indirect;
    t.remove_prefix(1);
    ++col;
  }
  c.st.expr = parseExpression(t, c.st.line, col, c.d);
  if (!c.st.expr) c.st.valid = false;
  if (c.f.size() == 2) {
    if (toUpper(c.f[1].text) != "X") { fail(c, c.f[1].col, "Only register X may be used for indexing"); return; }
    c.st.indexed = true;
    if (c.st.mode != AddrMode::Simple)
      fail(c, c.f[1].col, "Indexed addressing is only valid with simple addressing (not # or @)");
  }
}

// C'text' / X'hex' -> bytes. Returns false (after reporting) when malformed.
bool parseLiteral(Ctx& c, const Field& f, std::vector<byte_t>& out) {
  const std::string& t = f.text;
  const char kind = static_cast<char>(std::toupper(static_cast<unsigned char>(t[0])));
  if (t.size() < 4 || t.back() != '\'') { fail(c, f.col, "Malformed literal '" + t + "'"); return false; }
  const std::string body = t.substr(2, t.size() - 3);
  if (kind == 'C') {
    for (char ch : body) out.push_back(static_cast<byte_t>(ch));
    return true;
  }
  if (body.size() % 2 != 0) { fail(c, f.col, "X'..' literal needs an even number of hex digits"); return false; }
  for (std::size_t i = 0; i < body.size(); i += 2) {
    if (!std::isxdigit(static_cast<unsigned char>(body[i])) || !std::isxdigit(static_cast<unsigned char>(body[i + 1]))) {
      fail(c, f.col, "Invalid hex digit in '" + t + "'");
      return false;
    }
    out.push_back(static_cast<byte_t>(std::stoi(body.substr(i, 2), nullptr, 16)));
  }
  return true;
}

void parseInstructionOperands(Ctx& c) {
  Statement& st = c.st;
  switch (st.inst->schema) {
    case OperandSchema::None:     arity(c, 0, 0); break;
    case OperandSchema::Memory:   parseMemoryOperand(c); break;
    case OperandSchema::Reg:
      if (arity(c, 1, 1)) st.reg1 = parseRegister(c, c.f[0]);
      break;
    case OperandSchema::RegReg:
      if (arity(c, 2, 2)) { st.reg1 = parseRegister(c, c.f[0]); st.reg2 = parseRegister(c, c.f[1]); }
      break;
    case OperandSchema::RegCount:
      if (arity(c, 2, 2)) { st.reg1 = parseRegister(c, c.f[0]); st.expr = parseExprField(c, c.f[1]); }
      break;
    case OperandSchema::Number:
      if (arity(c, 1, 1)) st.expr = parseExprField(c, c.f[0]);
      break;
  }
}

void parseDirectiveOperands(Ctx& c) {
  Statement& st = c.st;
  switch (*st.directive) {
    case DirectiveKind::Nobase: arity(c, 0, 0); break;
    case DirectiveKind::End:
    case DirectiveKind::Org:
      if (arity(c, 0, 1) && !c.f.empty()) st.expr = parseExprField(c, c.f[0]);
      break;
    case DirectiveKind::Start:
    case DirectiveKind::Resb:
    case DirectiveKind::Resw:
    case DirectiveKind::Base:
    case DirectiveKind::Equ:
      if (arity(c, 1, 1)) st.expr = parseExprField(c, c.f[0]);
      break;
    case DirectiveKind::Byte:
    case DirectiveKind::Word:
      if (!arity(c, 1, c.f.size())) break;
      for (const Field& f : c.f) {
        DataItem item;
        const bool lit = f.text.size() >= 2 && f.text[1] == '\'' &&
                         std::strchr("CcXx", f.text[0]) != nullptr;
        if (lit) {
          if (*st.directive == DirectiveKind::Word) { fail(c, f.col, "WORD takes numeric expressions, not literals"); continue; }
          item.isLiteral = true;
          if (!parseLiteral(c, f, item.literal)) continue;
        } else {
          item.expr = parseExprField(c, f);
        }
        st.items.push_back(std::move(item));
      }
      break;
  }
}

}  // namespace

std::optional<Statement> parseLine(std::string_view line, int lineNo, Diagnostics& diags) {
  while (!line.empty() && (line.back() == '\r' || line.back() == '\n')) line.remove_suffix(1);
  if (!line.empty() && line.front() == '.') return std::nullopt;  // full-line comment

  const std::string_view code = stripComment(line);
  std::size_t pos = 0;
  auto nextField = [&](std::size_t& start) {
    while (pos < code.size() && isSpace(code[pos])) ++pos;
    start = pos;
    while (pos < code.size() && !isSpace(code[pos])) ++pos;
    return code.substr(start, pos - start);
  };
  auto isOpcodeName = [](std::string_view f) {
    if (!f.empty() && f[0] == '+') f.remove_prefix(1);
    const std::string up = toUpper(f);
    return findInstruction(up) != nullptr || findDirective(up).has_value();
  };

  Statement st;
  st.line = lineNo;
  st.source = std::string(line);

  std::size_t start = 0;
  std::string_view f1 = nextField(start);
  if (f1.empty()) return std::nullopt;  // blank / comment only
  std::size_t f1Start = start;

  std::string_view mnem = f1;
  std::size_t mnemStart = f1Start;
  if (!isOpcodeName(f1)) {                       // first field is a label
    st.label = std::string(f1);
    st.labelCol = static_cast<int>(f1Start) + 1;
    if (!isIdentifier(f1)) {
      diags.error(lineNo, st.labelCol, "Invalid label '" + st.label + "'");
      st.label.clear(); st.valid = false;
    } else if (registerNumber(toUpper(f1))) {
      diags.error(lineNo, st.labelCol, "'" + st.label + "' is a register name and cannot be a label");
      st.label.clear(); st.valid = false;
    }
    mnem = nextField(start);
    mnemStart = start;
    if (mnem.empty()) return st;                 // label-only line
  }

  st.mnemonicCol = static_cast<int>(mnemStart) + 1;
  if (mnem[0] == '+') { st.extended = true; mnem.remove_prefix(1); }
  st.mnemonic = toUpper(mnem);
  st.directive = findDirective(st.mnemonic);
  if (!st.directive) st.inst = findInstruction(st.mnemonic);
  if (!st.directive && !st.inst) {
    diags.error(lineNo, st.mnemonicCol, "Unknown mnemonic '" + std::string(mnem) + "'");
    st.valid = false;
    return st;
  }
  if (st.extended && st.directive) {
    diags.error(lineNo, st.mnemonicCol, "'+' can only be applied to instructions");
    st.valid = false;
  }

  while (pos < code.size() && isSpace(code[pos])) ++pos;
  std::string_view operandText = code.substr(pos);
  while (!operandText.empty() && isSpace(operandText.back())) operandText.remove_suffix(1);
  st.operandCol = static_cast<int>(pos) + 1;

  const std::vector<Field> fields = splitOperands(operandText, st.operandCol);
  Ctx ctx{st, fields, diags};
  if (st.inst) parseInstructionOperands(ctx);
  else if (st.directive) parseDirectiveOperands(ctx);
  return st;
}

}  // namespace sicxe
