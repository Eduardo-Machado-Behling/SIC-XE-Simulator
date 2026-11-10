#include "macro_text.hpp"

#include <cctype>
#include <utility>

namespace sicxe::macro_text {
namespace {

bool isWordChar(char c) { return std::isalnum(static_cast<unsigned char>(c)) != 0 || c == '_'; }
bool isIdentifierStart(char c) { return std::isalpha(static_cast<unsigned char>(c)) != 0 || c == '_'; }

// Display form of a marker (spec 4.4): "#i", or "#(d,i)" in a definition with nested definitions.
std::string markerText(const Piece& param, bool nested) {
  return nested ? "#(" + std::to_string(param.level) + "," + std::to_string(param.index) + ")"
                : "#" + std::to_string(param.index);
}

// .SER value: the serial in at least three digits (HEAD.SER -> HEAD017).
std::string serialText(int serial) {
  std::string digits = std::to_string(serial);
  if (digits.size() < 3) digits.insert(0, 3 - digits.size(), '0');
  return digits;
}

}  // namespace

// ---- text helpers -------------------------------------------------------------

std::string toUpper(std::string_view s) {
  std::string r(s);
  for (char& c : r) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  return r;
}

bool isSpace(char c) { return std::isspace(static_cast<unsigned char>(c)) != 0; }

bool isIdentifier(std::string_view s) {
  if (s.empty() || !isIdentifierStart(s[0])) return false;
  for (char c : s)
    if (!isWordChar(c)) return false;
  return true;
}

std::string_view trim(std::string_view s) {
  while (!s.empty() && isSpace(s.front())) s.remove_prefix(1);
  while (!s.empty() && isSpace(s.back())) s.remove_suffix(1);
  return s;
}

std::string_view withoutCr(std::string_view line) {
  if (!line.empty() && line.back() == '\r') line.remove_suffix(1);
  return line;
}

std::string_view operationMnemonic(std::string_view op) {
  if (!op.empty() && op.front() == '+') op.remove_prefix(1);
  return op.substr(0, op.find(','));
}

std::string_view codeOf(std::string_view line) {
  if (!line.empty() && line.front() == '.') return {};
  bool inQuote = false;
  for (std::size_t i = 0; i < line.size(); ++i) {
    if (line[i] == '\'') inQuote = !inQuote;
    else if (line[i] == ';' && !inQuote) return line.substr(0, i);
  }
  return line;
}

Token nextToken(std::string_view s, std::size_t& pos) {
  while (pos < s.size() && isSpace(s[pos])) ++pos;
  const std::size_t start = pos;
  while (pos < s.size() && !isSpace(s[pos])) ++pos;
  return {s.substr(start, pos - start), start};
}

std::vector<Token> splitList(std::string_view list) {
  std::vector<Token> items;
  if (list.empty()) return items;
  auto add = [&](std::size_t begin, std::size_t end) {
    while (begin < end && isSpace(list[begin])) ++begin;
    items.push_back({trim(list.substr(begin, end - begin)), begin});
  };
  bool inQuote = false;
  std::size_t start = 0;
  for (std::size_t i = 0; i < list.size(); ++i) {
    if (list[i] == '\'') inQuote = !inQuote;
    else if (list[i] == ',' && !inQuote) { add(start, i); start = i + 1; }
  }
  add(start, list.size());
  return items;
}

// ---- stored body ----------------------------------------------------------------

PieceLine textLine(std::string_view text) { return {{Piece::Kind::Text, std::string(text)}}; }

std::string displayForm(const PieceLine& line, bool nested) {
  std::string out;
  for (const Piece& p : line) {
    switch (p.kind) {
      case Piece::Kind::Text: out += p.text; break;
      case Piece::Kind::Param: out += markerText(p, nested); break;
      case Piece::Kind::Serial: out += ".SER"; break;
    }
  }
  return out;
}

PieceLine substitute(const PieceLine& line, const std::vector<std::string>& actuals) {
  PieceLine out;
  for (const Piece& p : line) {
    if (p.kind != Piece::Kind::Param)
      out.push_back(p);
    else if (p.level == 1)
      out.push_back({Piece::Kind::Text, actuals[static_cast<std::size_t>(p.index)]});
    else
      out.push_back({Piece::Kind::Param, {}, p.level - 1, p.index});
  }
  return out;
}

std::string outputText(const PieceLine& line, int serial) {
  std::string out;
  for (const Piece& p : line) {
    switch (p.kind) {
      case Piece::Kind::Text: out += p.text; break;
      case Piece::Kind::Param: out += markerText(p, true); break;
      case Piece::Kind::Serial: out += serialText(serial); break;
    }
  }
  return out;
}

PieceLine toPieces(std::string_view line, const FormalLookup& lookup) {
  PieceLine out;
  std::string text;
  auto flushText = [&] {
    if (!text.empty()) out.push_back({Piece::Kind::Text, std::move(text)});
    text.clear();
  };
  auto wordEnd = [&](std::size_t i, std::size_t end) {
    while (i < end && isWordChar(line[i])) ++i;
    return i;
  };
  const std::size_t codeEnd = codeOf(line).size();
  bool inQuote = false;
  std::size_t i = 0;
  while (i < codeEnd) {
    const char c = line[i];
    if (c == '\'') inQuote = !inQuote;
    if (inQuote || c == '\'' || (!isWordChar(c) && c != '.')) {
      text += c;
      ++i;
      continue;
    }
    if (c == '.') {
      if (i + 1 >= codeEnd || !isIdentifierStart(line[i + 1])) {
        text += c;
        ++i;
        continue;
      }
      const std::size_t end = wordEnd(i + 1, codeEnd);
      const std::string_view word = line.substr(i + 1, end - i - 1);
      if (toUpper(word) == "SER") {
        flushText();
        out.push_back({Piece::Kind::Serial, {}, 0, 0});
      } else if (auto param = lookup(word, i + 1)) {
        flushText();
        out.push_back(*param);
      } else {
        text += line.substr(i, end - i);
      }
      i = end;
      continue;
    }
    const std::size_t end = wordEnd(i, codeEnd);
    const std::string_view word = line.substr(i, end - i);
    const char first = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    const bool literalPrefix = word.size() == 1 && (first == 'C' || first == 'X') &&
                               end < codeEnd && line[end] == '\'';
    const bool registerName = i > 0 && line[i - 1] == '$';
    std::optional<Piece> param;
    if (isIdentifierStart(c) && !literalPrefix && !registerName) param = lookup(word, i);
    if (param) {
      flushText();
      out.push_back(*param);
    } else {
      text += word;
    }
    i = end;
  }
  text += line.substr(codeEnd);  // the comment, as written
  flushText();
  return out;
}

// ---- prototype ------------------------------------------------------------------

Prototype parsePrototype(std::string_view code) {
  Prototype p;
  std::size_t pos = 0;
  const Token t1 = nextToken(code, pos);
  const Token t2 = nextToken(code, pos);
  const Token afterT2 = nextToken(code, pos);
  std::size_t formalsAt = t2.offset;
  p.name = std::string(t1.text);
  p.nameOffset = t1.offset;
  if (!t2.text.empty() && t2.text.find_first_of(",=") == std::string_view::npos &&
      !afterT2.text.empty() && afterT2.text.front() != ',') {
    p.label = std::string(t1.text);
    p.labelOffset = t1.offset;
    p.name = std::string(t2.text);
    p.nameOffset = t2.offset;
    formalsAt = afterT2.offset;
  }
  if (t2.text.empty()) return p;

  // Formals: "X" is positional, "X=" / "X=default" a keyword.
  for (const Token& item : splitList(code.substr(formalsAt))) {
    PrototypeFormal f;
    f.offset = formalsAt + item.offset;
    const std::size_t eq = item.text.find('=');
    f.name = std::string(trim(item.text.substr(0, eq)));
    if (eq != std::string_view::npos) f.defaultValue = std::string(trim(item.text.substr(eq + 1)));
    p.formals.push_back(std::move(f));
  }
  return p;
}

}  // namespace sicxe::macro_text
