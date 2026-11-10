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

// A definition's display body, squashed line by line.
[[maybe_unused]] static std::vector<std::string> display(const MacroDefinition& d) {
  std::vector<std::string> body;
  for (const std::string& line : d.displayBody) body.push_back(squash(line));
  return body;
}

// SOLUCAO_MACRO2 exercise 1, column 1 as the professor wrote it.
static const char EX1_DEFINITION[] =
    "MCDEFN\nLABEL      MOD         DIVIDEND, DIVISOR, REMAINDR\nLABEL      LOAD        DIVIDEND\n"
    "HEAD.SER SUB           DIVISOR\n           BRPOS       HEAD.SER\n           BRZERO      HEAD.SER\n"
    "           ADD         DIVISOR\n           STORE       REMAINDR\nMCEND\n";

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

// ---------------------------------------------------------------------------
// Definitions
TEST(exercise1_definition_table) {   // SOLUCAO_MACRO2 ex.1, column 1 as written
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  auto r = MacroProcessor(o).process(EX1_DEFINITION);
  CHECK(r.ok()); CHECK(r.definitions.size() == 1);
  if (r.definitions.empty()) return;
  auto& d = r.definitions[0];
  CHECK(d.name == "MOD"); CHECK(d.labelFormal == "LABEL"); CHECK(d.formals.size() == 3); CHECK(!d.hasNested);
  std::vector<std::string> body; for (auto& l : d.displayBody) body.push_back(squash(l));
  CHECK((body == std::vector<std::string>{"LABEL MOD DIVIDEND, DIVISOR, REMAINDR", "#0 LOAD #1",
        "HEAD.SER SUB #2", "BRPOS HEAD.SER", "BRZERO HEAD.SER", "ADD #2", "STORE #3", "MCEND"}));
  CHECK(r.text.find("MCDEFN") == std::string::npos);   // definitions are removed from the output
  CHECK(r.hasMacros); CHECK(d.index == 0); CHECK(d.active); CHECK(d.originSourceLine == 1);
  CHECK((d.bodySourceLines == std::vector<int>{2, 3, 4, 5, 6, 7, 8, 9}));
  CHECK(r.names.size() == 1);
  if (!r.names.empty()) { CHECK(r.names[0].name == "MOD"); CHECK(r.names[0].definition == 0); CHECK(r.names[0].line == 2); }
}

TEST(figure_4_10_nested_formals) {
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  auto r = MacroProcessor(o).process(
      "MCDEFN\nX A,B,C,D\n        A,B,C,D\nMCDEFN\nY A,B,E,F\n        A,B,C,D\nMCDEFN\nZ A,C,E,G\n"
      "        A,B,C,D\n        E,F,G,H\nMCEND\n        E,F,G,H\nMCEND\n        E,F,G,H\nMCEND\n");
  CHECK(r.ok()); CHECK(r.definitions.size() == 1);
  if (r.definitions.empty()) return;
  auto& d = r.definitions[0];
  CHECK(d.name == "X"); CHECK(d.hasNested); CHECK(d.formals.size() == 4);
  CHECK((display(d) == std::vector<std::string>{"X A,B,C,D", "#(1,1),#(1,2),#(1,3),#(1,4)", "MCDEFN",
        "Y A,B,E,F", "#(2,1),#(2,2),#(1,3),#(1,4)", "MCDEFN", "Z A,C,E,G", "#(3,1),#(2,2),#(3,2),#(1,4)",
        "#(3,3),#(2,4),#(3,4),H", "MCEND", "#(2,3),#(2,4),G,H", "MCEND", "E,F,G,H", "MCEND"}));
  CHECK(r.names.size() == 1);   // Y and Z only exist once X is expanded
}

TEST(prototype_shapes) {   // spec 4.1 table, each in its own MCDEFN ... MCEND
  struct Shape { const char* line; const char* label; const char* name; const char* formals; };
  const Shape shapes[] = {
      {"LABEL MOD A, B", "LABEL", "MOD", "A,B"},  {"L INCR A", "L", "INCR", "A"},
      {"SPOT ABSDIF A,B,C", "SPOT", "ABSDIF", "A,B,C"}, {"OUTER A=,B=", "", "OUTER", "A,B"},
      {"X A,B,C,D", "", "X", "A,B,C,D"},          {"SOMA X, Y, Z", "", "SOMA", "X,Y,Z"},
      {"SCALE RP", "", "SCALE", "RP"},            {"A FORMAL1", "", "A", "FORMAL1"},
      {"L\tSOMA\tX,Y,Z", "L", "SOMA", "X,Y,Z"},   // tabs as separators
  };
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  for (const Shape& s : shapes) {
    auto r = MacroProcessor(o).process(std::string("MCDEFN\n") + s.line + "\nMCEND\n");
    std::string formals;
    if (!r.definitions.empty())
      for (const Formal& f : r.definitions[0].formals) formals += (formals.empty() ? "" : ",") + f.name;
    const bool good = r.ok() && r.definitions.size() == 1 && r.definitions[0].labelFormal == s.label &&
                      r.definitions[0].name == s.name && formals == s.formals;
    CHECK(good);
    if (!good) std::printf("    shape '%s' read as label '%s', name '%s', formals '%s'\n", s.line,
                           r.definitions.empty() ? "?" : r.definitions[0].labelFormal.c_str(),
                           r.definitions.empty() ? "?" : r.definitions[0].name.c_str(), formals.c_str());
  }

  auto r = MacroProcessor(o).process("MCDEFN\nINCR L=,A=ACCUM,B=1,C=ACCUM\nMCEND\n");
  CHECK(r.ok()); CHECK(r.definitions.size() == 1);
  if (r.definitions.empty()) return;
  const auto& f = r.definitions[0].formals;
  CHECK(r.definitions[0].labelFormal.empty()); CHECK(f.size() == 4);
  if (f.size() != 4) return;
  CHECK(f[0].name == "L" && f[0].defaultValue == std::string());
  CHECK(f[1].name == "A" && f[1].defaultValue == std::string("ACCUM"));
  CHECK(f[2].name == "B" && f[2].defaultValue == std::string("1"));
  CHECK(f[3].name == "C" && f[3].defaultValue == std::string("ACCUM"));
}

TEST(literal_immediate_in_body_is_not_a_parameter) {   // Review Focus 1
  auto r = MacroProcessor().process("MCDEFN\nSOMA X\n        LDA #1\n        LDA #X\nMCEND\n");
  CHECK(r.ok()); CHECK(r.definitions.size() == 1);
  if (r.definitions.empty()) return;
  CHECK((display(r.definitions[0]) == std::vector<std::string>{"SOMA X", "LDA #1", "LDA ##1", "MCEND"}));
}

TEST(body_markers_skip_quotes_comments_and_registers) {
  auto r = MacroProcessor().process(
      "MCDEFN\nM A,X\n        CLEAR $A\n        BYTE C'A'\n        BYTE X'0A'\n        LDA A ; A\n"
      ". A comment\n        ADD @.A\nFIM.SER STA X\n        LDA .Q\nMCEND\n");
  CHECK(r.ok()); CHECK(r.definitions.size() == 1);
  if (r.definitions.empty()) return;
  CHECK((display(r.definitions[0]) == std::vector<std::string>{"M A,X", "CLEAR $A", "BYTE C'A'",
        "BYTE X'0A'", "LDA #1 ; A", ". A comment", "ADD @#1", "FIM.SER STA #2", "LDA .Q", "MCEND"}));
}

TEST(nested_prototype_substitutes_outer_formals) {   // spec 4.4: own formal names stay as written
  auto r = MacroProcessor().process("MCDEFN\nDEFINE NAME,K\nMCDEFN\nNAME K,B=K\n        LDA K\nMCEND\nMCEND\n");
  CHECK(r.ok()); CHECK(r.definitions.size() == 1);
  if (r.definitions.empty()) return;
  CHECK((display(r.definitions[0]) == std::vector<std::string>{"DEFINE NAME,K", "MCDEFN", "#(1,1) K,B=#(1,2)",
        "LDA #(2,1)", "MCEND", "MCEND"}));
}

TEST(lowercase_keywords) {   // Review Focus 3
  auto r = MacroProcessor().process("mcdefn\nsoma x\n        lda x\nmcend\n");
  CHECK(r.ok()); CHECK(r.hasMacros); CHECK(r.definitions.size() == 1); CHECK(r.names.size() == 1);
  if (r.definitions.empty() || r.names.empty()) return;
  CHECK(r.definitions[0].name == "SOMA"); CHECK(r.names[0].name == "SOMA");
  CHECK((display(r.definitions[0]) == std::vector<std::string>{"soma x", "lda #1", "mcend"}));
}

TEST(redefinition_keeps_old_inactive) {
  auto r = MacroProcessor().process(
      "MCDEFN\nSOMA X\n        LDA X\nMCEND\nMCDEFN\nSOMA Y\n        STA Y\nMCEND\n");
  CHECK(r.ok()); CHECK(r.definitions.size() == 2); CHECK(r.names.size() == 1);
  if (r.definitions.size() != 2 || r.names.empty()) return;
  CHECK(!r.definitions[0].active); CHECK(r.definitions[1].active); CHECK(r.definitions[1].index == 1);
  CHECK(r.names[0].definition == 1); CHECK(r.names[0].line == 6); CHECK(r.definitions[1].originSourceLine == 5);
}

TEST(definitions_are_removed_from_output) {
  const std::string src = "PROG    START 0\r\n        MCDEFN\r\nSOMA X\r\n        LDA X\r\n        MCEND\r\n"
                          "\tEND PROG ; kept as is\r\n";
  auto r = MacroProcessor().process(src);
  CHECK(r.ok()); CHECK(r.hasMacros);
  CHECK(r.text == "PROG    START 0\r\n\tEND PROG ; kept as is\r\n");
  CHECK(r.lineMap.size() == 3);
  if (r.lineMap.size() != 3) return;
  CHECK(r.lineMap[0].output == 1 && r.lineMap[0].source == 1 && r.lineMap[0].kind == LineKind::Verbatim);
  CHECK(r.lineMap[1].output == 2 && r.lineMap[1].source == 6 && r.lineMap[1].kind == LineKind::Verbatim);
  CHECK(r.lineMap[2].output == 3 && r.lineMap[2].source == 7);
  if (!r.definitions.empty())   // no '\r' in the stored body
    CHECK((r.definitions[0].displayBody == std::vector<std::string>{"SOMA X", "        LDA #1", "        MCEND"}));
}

TEST(definition_errors) {   // spec 4.6
  CHECK(hasError("PROG    START 0\n        MCEND\n", "MCEND without MCDEFN", 2));
  CHECK(hasError("        MCDEFN\nSOMA X\n        LDA X\n", "MCDEFN without MCEND", 1));
  CHECK(hasError("MCDEFN\nMCEND\n", "Missing prototype after MCDEFN", 1));
  CHECK(hasError("MCDEFN\n. comment\n\n        MCEND\n", "Missing prototype after MCDEFN", 1));
  CHECK(hasError("        MCDEFN SOMA\nSOMA X\n        MCEND\n", "MCDEFN takes no label or operands", 1));
  CHECK(hasError("L       MCDEFN\nSOMA X\n        MCEND\n", "MCDEFN takes no label or operands", 1));
  CHECK(hasError("MCDEFN\nSOMA X\n        MCEND X\n", "MCEND takes no label or operands", 3));
  CHECK(hasError("MCDEFN\nLDA X\nMCEND\n", "'LDA' is an instruction and cannot be a macro name", 2));
  CHECK(hasError("MCDEFN\nEND X\nMCEND\n", "'END' is a directive and cannot be a macro name", 2));
  CHECK(hasError("MCDEFN\n1SOMA X\nMCEND\n", "Invalid macro name '1SOMA'", 2));
  CHECK(hasError("MCDEFN\nSOMA X,Y,X\nMCEND\n", "Duplicate formal 'X' in prototype", 2));
  CHECK(hasError("MCDEFN\nX SOMA X,Y\nMCEND\n", "Duplicate formal 'X' in prototype", 2));
  CHECK(hasError("MCDEFN\nSOMA X,Y+1\nMCEND\n", "Invalid formal 'Y+1' in prototype", 2));

  auto dup = MacroProcessor().process("MCDEFN\nSOMA X,Y,X\nMCEND\n");
  CHECK(dup.diagnostics.size() == 1);
  if (!dup.diagnostics.empty()) { CHECK(dup.diagnostics[0].column == 10); CHECK(dup.diagnostics[0].length == 1); }

  // Errors do not stop the processor: the definition after a stray MCEND is still read.
  auto r = MacroProcessor().process("        MCEND\nMCDEFN\nSOMA X\nMCEND\n");
  CHECK(!r.ok()); CHECK(r.definitions.size() == 1); CHECK(r.names.size() == 1);
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
