#pragma once
#include <algorithm>
#include <string>
#include <utility>
#include <vector>

namespace sicxe {

enum class Severity { Warning, Error };

struct Diagnostic {
  Severity severity = Severity::Error;
  int line = 0;    // 1-based
  int column = 0;  // 1-based, 0 = unknown
  std::string message;

  std::string toString() const {
    std::string s = std::to_string(line);
    if (column > 0) s += ":" + std::to_string(column);
    s += severity == Severity::Error ? ": error: " : ": warning: ";
    return s + message;
  }
};

class Diagnostics {
 public:
  void error(int line, int column, std::string msg) {
    items_.push_back({Severity::Error, line, column, std::move(msg)});
    ++errors_;
  }
  void warning(int line, int column, std::string msg) {
    items_.push_back({Severity::Warning, line, column, std::move(msg)});
  }
  bool hasErrors() const { return errors_ > 0; }

  // Pass-1 and pass-2 messages interleave by source line for readability.
  std::vector<Diagnostic> sorted() const {
    auto v = items_;
    std::stable_sort(v.begin(), v.end(),
                     [](const Diagnostic& a, const Diagnostic& b) { return a.line < b.line; });
    return v;
  }

 private:
  std::vector<Diagnostic> items_;
  int errors_ = 0;
};

inline std::string formatDiagnostics(const std::vector<Diagnostic>& ds) {
  std::string out;
  for (const auto& d : ds) out += d.toString() + "\n";
  return out;
}

}  // namespace sicxe
