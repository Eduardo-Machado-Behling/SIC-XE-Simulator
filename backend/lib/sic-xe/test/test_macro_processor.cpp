// Dependency-free test runner for the macro processor (same pattern as test_assembler.cpp).
#include <cctype>
#include <cstdio>
#include <string>
#include <vector>

#include "assembler/macro_processor.hpp"

using namespace sicxe;

static int g_failures = 0, g_checks = 0;
#define CHECK(cond)                                                              \
  do {                                                                           \
    ++g_checks;                                                                  \
    if (!(cond)) { ++g_failures; std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)

// Collapses runs of spaces/tabs into one space and trims the ends.
[[maybe_unused]] static std::string squash(const std::string& s) {
  std::string out;
  bool pendingSpace = false;
  for (char c : s) {
    if (c == ' ' || c == '\t') { pendingSpace = !out.empty(); continue; }
    if (pendingSpace) out += ' ';
    pendingSpace = false;
    out += c;
  }
  return out;
}

// Lines of r.text whose lineMap entry has the given kind, squashed.
[[maybe_unused]] static std::vector<std::string> outputLines(const MacroResult& r, LineKind kind) {
  std::vector<std::string> lines, all;
  std::size_t pos = 0;
  for (;;) {
    const std::size_t nl = r.text.find('\n', pos);
    all.push_back(r.text.substr(pos, nl == std::string::npos ? nl : nl - pos));
    if (nl == std::string::npos) break;
    pos = nl + 1;
  }
  for (std::size_t i = 0; i < all.size() && i < r.lineMap.size(); ++i)
    if (r.lineMap[i].kind == kind) lines.push_back(squash(all[i]));
  return lines;
}

// Processes src and checks there is an error with message msg on the given line.
[[maybe_unused]] static bool hasError(const std::string& src, const std::string& msg, int line) {
  const MacroResult r = MacroProcessor().process(src);
  for (const Diagnostic& d : r.diagnostics)
    if (d.severity == Severity::Error && d.line == line && d.message == msg) return true;
  std::printf("  (wanted %d: %s; got:\n", line, msg.c_str());
  for (const Diagnostic& d : r.diagnostics) std::printf("    %s\n", d.toString().c_str());
  std::printf("  )\n");
  return false;
}

// Operation set of Calingaert's macro examples.
[[maybe_unused]] static std::function<bool(std::string_view)> calingaertOps() {
  return [](std::string_view upper) {
    static const char* const ops[] = {"LOAD", "STORE", "ADD",    "SUB",    "MULT",   "BR",
                                      "BRPOS", "BRZERO", "SPACE", "SHIFTL", "SHIFTR"};
    for (const char* op : ops)
      if (upper == op) return true;
    return false;
  };
}

#define TEST(name) static void name(); static Registrar r_##name(#name, name); static void name()
struct Registrar { Registrar(const char* n, void (*f)()); };
static std::vector<std::pair<const char*, void (*)()>>& registry() { static std::vector<std::pair<const char*, void (*)()>> r; return r; }
Registrar::Registrar(const char* n, void (*f)()) { registry().push_back({n, f}); }

// ---------------------------------------------------------------------------
TEST(identity_for_source_without_macros) {
  const std::string src = "PROG    START 0x0000\n. comment\n\tLDA #1 ; c\nX WORD 5\n        END PROG\n";
  auto r = MacroProcessor().process(src);
  CHECK(r.ok()); CHECK(!r.hasMacros); CHECK(r.text == src);
  CHECK(r.lineMap.size() == 6);   // 5 lines + final empty segment
  for (auto& o : r.lineMap) CHECK(o.kind == LineKind::Verbatim && o.output == o.source);
}

TEST(identity_preserves_crlf) {
  const std::string src = "P START 0\r\n LDA #1\r\n END P\r\n";
  CHECK(MacroProcessor().process(src).text == src);
}

int main(int argc, char** argv) {
  if (argc > 2) {
    std::fprintf(stderr, "Usage: %s [test_case]\n", argv[0]);
    return 2;
  }

  const std::string selected = argc == 2 ? argv[1] : "";
  bool found = selected.empty();
  for (auto& [name, fn] : registry()) {
    if (!selected.empty() && selected != name) continue;
    found = true;
    const int before = g_failures;
    fn();
    std::printf("[%s] %s\n", g_failures == before ? " OK " : "FAIL", name);
  }

  if (!found) {
    std::fprintf(stderr, "Unknown test case: %s\n", selected.c_str());
    return 2;
  }

  std::printf("\n%d checks, %d failures\n", g_checks, g_failures);
  return g_failures ? 1 : 0;
}
