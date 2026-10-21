#include "assembler/expression.hpp"

#include <cctype>

namespace sicxe {
namespace {

using Kind = ExprNode::Kind;

bool isIdentStart(char c) { return std::isalpha(static_cast<unsigned char>(c)) || c == '_'; }
bool isIdentChar(char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_'; }

class ExprParser {
 public:
  ExprParser(std::string_view s, int line, int col, Diagnostics& d)
      : s_(s), line_(line), col_(col), diags_(d) {}

  ExprPtr parse() {
    ExprPtr e = parseSum();
    if (!e) return nullptr;
    skipWs();
    if (pos_ < s_.size()) {
      fail(pos_, std::string("Unexpected '") + s_[pos_] + "' in expression");
      return nullptr;
    }
    return e;
  }

 private:
  void skipWs() {
    while (pos_ < s_.size() && std::isspace(static_cast<unsigned char>(s_[pos_]))) ++pos_;
  }
  void fail(std::size_t at, const std::string& msg) {
    diags_.error(line_, col_ + static_cast<int>(at), msg);
  }
  int colAt(std::size_t at) const { return col_ + static_cast<int>(at); }

  ExprPtr binary(char op, ExprPtr l, ExprPtr r, std::size_t at) {
    auto n = std::make_shared<ExprNode>();
    n->kind = Kind::Binary; n->op = op; n->lhs = std::move(l); n->rhs = std::move(r);
    n->column = colAt(at);
    return n;
  }

  ExprPtr parseSum() {
    ExprPtr l = parseProduct();
    while (l) {
      skipWs();
      if (pos_ >= s_.size() || (s_[pos_] != '+' && s_[pos_] != '-')) break;
      const char op = s_[pos_];
      const std::size_t at = pos_++;
      ExprPtr r = parseProduct();
      if (!r) return nullptr;
      l = binary(op, l, r, at);
    }
    return l;
  }

  ExprPtr parseProduct() {
    ExprPtr l = parseUnary();
    while (l) {
      skipWs();
      if (pos_ >= s_.size() || (s_[pos_] != '*' && s_[pos_] != '/')) break;
      const char op = s_[pos_];
      const std::size_t at = pos_++;
      ExprPtr r = parseUnary();
      if (!r) return nullptr;
      l = binary(op, l, r, at);
    }
    return l;
  }

  ExprPtr parseUnary() {
    skipWs();
    if (pos_ < s_.size() && (s_[pos_] == '-' || s_[pos_] == '+')) {
      const char op = s_[pos_];
      const std::size_t at = pos_++;
      ExprPtr e = parseUnary();
      if (!e) return nullptr;
      auto n = std::make_shared<ExprNode>();
      n->kind = Kind::Unary; n->op = op; n->lhs = std::move(e); n->column = colAt(at);
      return n;
    }
    return parsePrimary();
  }

  ExprPtr parsePrimary() {
    skipWs();
    if (pos_ >= s_.size()) { fail(pos_, "Expected an operand"); return nullptr; }
    const char c = s_[pos_];
    auto n = std::make_shared<ExprNode>();
    n->column = colAt(pos_);

    if (std::isdigit(static_cast<unsigned char>(c))) {
      const std::size_t start = pos_;
      while (pos_ < s_.size() && std::isalnum(static_cast<unsigned char>(s_[pos_]))) ++pos_;
      const std::string tok(s_.substr(start, pos_ - start));
      std::int64_t v = 0;
      const bool hex = tok.size() > 2 && tok[0] == '0' && (tok[1] == 'x' || tok[1] == 'X');
      for (std::size_t i = hex ? 2 : 0; i < tok.size(); ++i) {
        const char d = tok[i];
        int digit;
        if (std::isdigit(static_cast<unsigned char>(d))) digit = d - '0';
        else if (hex && std::isxdigit(static_cast<unsigned char>(d))) digit = std::tolower(d) - 'a' + 10;
        else { fail(start, "Invalid number '" + tok + "'"); return nullptr; }
        v = v * (hex ? 16 : 10) + digit;
        if (v > (std::int64_t{1} << 40)) { fail(start, "Number '" + tok + "' is too large"); return nullptr; }
      }
      n->kind = Kind::Number; n->number = v;
      return n;
    }
    if (isIdentStart(c)) {
      const std::size_t start = pos_;
      while (pos_ < s_.size() && isIdentChar(s_[pos_])) ++pos_;
      n->kind = Kind::Symbol; n->name = std::string(s_.substr(start, pos_ - start));
      return n;
    }
    if (c == '*') { ++pos_; n->kind = Kind::Location; return n; }
    if (c == '(') {
      ++pos_;
      ExprPtr e = parseSum();
      if (!e) return nullptr;
      skipWs();
      if (pos_ >= s_.size() || s_[pos_] != ')') { fail(pos_, "Expected ')'"); return nullptr; }
      ++pos_;
      return e;
    }
    fail(pos_, std::string("Unexpected '") + c + "' in expression");
    return nullptr;
  }

  std::string_view s_;
  std::size_t pos_ = 0;
  int line_, col_;
  Diagnostics& diags_;
};

constexpr std::int64_t kLimit = std::int64_t{1} << 48;

std::optional<Value> evalNode(const ExprNode& n, const EvalContext& c, int line, Diagnostics& d) {
  switch (n.kind) {
    case Kind::Number:   return Value{n.number, 0};
    case Kind::Location: return Value{c.location, 1};
    case Kind::Symbol: {
      std::optional<Value> v;
      if (c.lookup) v = c.lookup(n.name);
      if (!v) {
        d.error(line, n.column,
                "Undefined symbol '" + n.name + "'" +
                    (c.forwardRefsAllowed ? "" : " (must be defined before this statement)"));
        return std::nullopt;
      }
      return v;
    }
    case Kind::Unary: {
      auto v = evalNode(*n.lhs, c, line, d);
      if (!v) return std::nullopt;
      if (n.op == '-') { v->value = -v->value; v->relocDegree = -v->relocDegree; }
      return v;
    }
    case Kind::Binary: {
      auto l = evalNode(*n.lhs, c, line, d);
      auto r = evalNode(*n.rhs, c, line, d);
      if (!l || !r) return std::nullopt;
      Value out;
      switch (n.op) {
        case '+': out = {l->value + r->value, l->relocDegree + r->relocDegree}; break;
        case '-': out = {l->value - r->value, l->relocDegree - r->relocDegree}; break;
        case '*':
        case '/':
          if (l->relocDegree != 0 || r->relocDegree != 0) {
            d.error(line, n.column, "Relocatable values cannot be multiplied or divided");
            return std::nullopt;
          }
          if (n.op == '/' && r->value == 0) { d.error(line, n.column, "Division by zero"); return std::nullopt; }
          out = {n.op == '*' ? l->value * r->value : l->value / r->value, 0};
          break;
        default: return std::nullopt;
      }
      if (out.value > kLimit || out.value < -kLimit) {
        d.error(line, n.column, "Expression overflow");
        return std::nullopt;
      }
      return out;
    }
  }
  return std::nullopt;
}

}  // namespace

ExprPtr parseExpression(std::string_view text, int line, int column, Diagnostics& diags) {
  return ExprParser(text, line, column, diags).parse();
}

std::optional<Value> evaluate(const ExprNode& e, const EvalContext& c, int line, Diagnostics& d) {
  auto v = evalNode(e, c, line, d);
  if (v && (v->relocDegree < 0 || v->relocDegree > 1)) {
    d.error(line, e.column, "Expression is neither absolute nor simply relocatable");
    return std::nullopt;
  }
  return v;
}

}  // namespace sicxe
