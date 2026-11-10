// Dependency-free test runner for the macro processor (same pattern as test_assembler.cpp).
#include <cctype>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "assembler/assembler.hpp"
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

// Figure 4.10: X defines Y, which defines Z (lines 1-15).
static const char FIGURE_4_10_DEFINITION[] =
    "MCDEFN\nX A,B,C,D\n        A,B,C,D\nMCDEFN\nY A,B,E,F\n        A,B,C,D\nMCDEFN\nZ A,C,E,G\n"
    "        A,B,C,D\n        E,F,G,H\nMCEND\n        E,F,G,H\nMCEND\n        E,F,G,H\nMCEND\n";

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
  auto r = MacroProcessor(o).process(FIGURE_4_10_DEFINITION);
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
  CHECK(r.definitions.size() == 1);
  if (r.definitions.size() == 1)   // no '\r' in the stored body
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

// ---------------------------------------------------------------------------
// Expansion (one level)
static const char M3_DEFINITION[] = "MCDEFN\nM3 P,Q,R=Z\n        LDA P\n        LDA Q\n        LDA R\nMCEND\n";

TEST(exercise1_seventeenth_expansion) {   // SOLUCAO_MACRO2 ex.1
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  std::string src = EX1_DEFINITION;
  for (int i = 0; i < 16; ++i) src += "           MOD         A, B, C\n";
  src += "PUZZLE MOD COCONUTS, MONKEYS, LEFTOVER\n";
  auto r = MacroProcessor(o).process(src);
  CHECK(r.ok()); CHECK(r.expansions.size() == 17);
  if (r.expansions.size() != 17) return;
  CHECK(r.expansions[16].serial == 17);
  auto out = outputLines(r, LineKind::Expanded);
  CHECK(out.size() == 17 * 6);
  if (out.size() < 6) return;
  std::vector<std::string> last(out.end() - 6, out.end());
  CHECK((last == std::vector<std::string>{"PUZZLE LOAD COCONUTS", "HEAD017 SUB MONKEYS",
        "BRPOS HEAD017", "BRZERO HEAD017", "ADD MONKEYS", "STORE LEFTOVER"}));
  CHECK(out[1] == "HEAD001 SUB B");
  // An empty #0 leaves the line starting with the blanks that followed the marker.
  CHECK(r.text.find("\n      LOAD        A\n") != std::string::npos);
  CHECK(outputLines(r, LineKind::Label).empty());   // the label formal takes PUZZLE, no EQU
}

TEST(keyword_defaults_and_dot_marker) {   // slides 19/21
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  auto r = MacroProcessor(o).process("MCDEFN\nINCR L=,A=ACCUM,B=1,C=ACCUM\nL LOAD A\nADD @.B\nSTORE C\nMCEND\n"
                                      "INCR L=MARK, A=COUNT, B=1, C=COUNT\nINCR\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{
        "MARK LOAD COUNT", "ADD @1", "STORE COUNT", "LOAD ACCUM", "ADD @1", "STORE ACCUM"}));
}

TEST(mixed_positional_and_keyword) {
  auto r = MacroProcessor().process(std::string(M3_DEFINITION) + "        M3 1,R=9,2\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"LDA 1", "LDA 2", "LDA 9"}));
  CHECK(r.expansions.size() == 1);
  if (r.expansions.size() != 1) return;
  const auto& a = r.expansions[0].actuals;
  CHECK(a.size() == 3);   // no label formal, so no #0
  if (a.size() != 3) return;
  CHECK(a[0].index == 1 && a[0].formal == "P" && a[0].value == "1");
  CHECK(a[1].index == 2 && a[1].formal == "Q" && a[1].value == "2");
  CHECK(a[2].index == 3 && a[2].formal == "R" && a[2].value == "9");
}

TEST(empty_actual) {   // slide 17: INCR , COUNT
  auto r = MacroProcessor().process(std::string(M3_DEFINITION) + "        M3 ,2\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"LDA", "LDA 2", "LDA Z"}));
  CHECK(r.expansions.size() == 1);
  if (r.expansions.size() != 1) return;
  CHECK(r.expansions[0].actuals.size() == 3);
  if (r.expansions[0].actuals.size() == 3) CHECK(r.expansions[0].actuals[0].value.empty());
}

TEST(label_without_label_formal_becomes_equ) {
  auto r = MacroProcessor().process("MCDEFN\nSOMA2 P\n        LDA P\nMCEND\nAQUI SOMA2 X\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Call) == std::vector<std::string>{".AQUI SOMA2 X"}));
  CHECK((outputLines(r, LineKind::Label) == std::vector<std::string>{"AQUI EQU *"}));
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"LDA X"}));
  CHECK(r.text == ".AQUI SOMA2 X\nAQUI EQU *\n        LDA X\n");
}

TEST(quotes_comments_and_registers_untouched) {   // spec 4.3
  auto r = MacroProcessor().process(
      "MCDEFN\nM A\n        CLEAR $A\n        BYTE C'A'\n        LDA A ; A\nMCEND\n        M BUF\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"CLEAR $A", "BYTE C'A'", "LDA BUF ; A"}));
}

TEST(literal_immediate_survives_expansion) {   // Review Focus 1
  auto r = MacroProcessor().process("MCDEFN\nSOMA X\n        LDA #1\n        LDA #X\n        LDA @X\nMCEND\n"
                                    "        SOMA 3\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"LDA #1", "LDA #3", "LDA @3"}));
}

TEST(case_insensitive_call) {   // Review Focus 3
  auto r = MacroProcessor().process("MCDEFN\nSOMA X,Y,Z\n        LDA X\n        ADD Y\n        STA Z\nMCEND\n"
                                    "        soma 1,2,3\n        soma z=3,x=1,y=2\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"LDA 1", "ADD 2", "STA 3",
        "LDA 1", "ADD 2", "STA 3"}));
  CHECK(r.expansions.size() == 2);
  if (!r.expansions.empty()) CHECK(r.expansions[0].macro == "SOMA");
}

TEST(crlf_expansion) {   // Review Focus 2: generated lines end like their call line
  const std::string src = "P START 0\r\n        MCDEFN\r\n        SOMA X,Y\r\n        LDA X\r\n        ADD Y\r\n"
                          "        MCEND\r\nAQUI    SOMA A,B\r\n        SOMA C,D\n        END P\r\n";
  auto r = MacroProcessor().process(src);
  CHECK(r.ok());
  CHECK(r.text == "P START 0\r\n.AQUI    SOMA A,B\r\nAQUI EQU *\r\n        LDA A\r\n        ADD B\r\n"
                  ".        SOMA C,D\n        LDA C\n        ADD D\n        END P\r\n");
  CHECK(r.expansions.size() == 2);
  if (r.expansions.empty()) return;
  CHECK(r.expansions[0].callText == "AQUI    SOMA A,B");
  CHECK(r.expansions[0].actuals.size() == 2);
  if (r.expansions[0].actuals.size() == 2) CHECK(r.expansions[0].actuals[1].value == "B");
}

TEST(call_errors) {   // spec 4.6, each on the call line
  const std::string def = "MCDEFN\nSOMA X,Y,V\n        LDA X\nMCEND\n";
  CHECK(hasError(def + "        SOMA 1,2,3,4\n", "Too many arguments for SOMA (expects 3)", 5));
  CHECK(hasError(def + "        SOMA 1,Z=2\n", "Unknown keyword 'Z' for SOMA", 5));
  CHECK(hasError(def + "        SOMA 1,X=2\n", "Argument 'X' given twice", 5));
  CHECK(hasError(def + "        SOMA Y=1,y=2\n", "Argument 'Y' given twice", 5));

  // The error points at the offending actual, and the call is still expanded.
  auto r = MacroProcessor().process(def + "        SOMA 1,2,3,4\n");
  CHECK(r.diagnostics.size() == 1);
  if (!r.diagnostics.empty()) { CHECK(r.diagnostics[0].column == 20); CHECK(r.diagnostics[0].length == 1); }
  CHECK(r.expansions.size() == 1);

  // Two extra actuals: reported once.
  CHECK(MacroProcessor().process(def + "        SOMA 1,2,3,4,5\n").diagnostics.size() == 1);

  // "Z=2" and "X=2" start at column 16; the first value of X is the one expanded.
  for (const char* call : {"        SOMA 1,Z=2\n", "        SOMA 1,X=2\n"}) {
    auto bad = MacroProcessor().process(def + call);
    CHECK(bad.diagnostics.size() == 1);
    if (!bad.diagnostics.empty()) CHECK(bad.diagnostics[0].column == 16 && bad.diagnostics[0].length == 3);
    CHECK((outputLines(bad, LineKind::Expanded) == std::vector<std::string>{"LDA 1"}));
  }
}

TEST(comments_and_blank_lines_in_body) {   // spec 4.5: emitted on every expansion
  auto r = MacroProcessor().process("MCDEFN\nM\n. note\n\n        LDA X\nMCEND\n        M\n        M\n");
  CHECK(r.ok());
  CHECK(r.text == ".        M\n. note\n\n        LDA X\n.        M\n. note\n\n        LDA X\n");
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{". note", "", "LDA X", ". note", "",
        "LDA X"}));
}

TEST(line_map_kinds) {
  const std::string src = "PROG    START 0\n        MCDEFN\nDOBRA   V\n        LDA V\n        ADD V\n"
                          "        MCEND\n        DOBRA N\nAQUI    DOBRA M\n        END PROG\n";
  auto r = MacroProcessor().process(src);
  CHECK(r.ok());
  CHECK(r.text == "PROG    START 0\n.        DOBRA N\n        LDA N\n        ADD N\n.AQUI    DOBRA M\nAQUI EQU *\n"
                  "        LDA M\n        ADD M\n        END PROG\n");
  struct Row { int source; LineKind kind; int serial; };
  const Row rows[] = {{1, LineKind::Verbatim, 0}, {7, LineKind::Call, 1},     {7, LineKind::Expanded, 1},
                      {7, LineKind::Expanded, 1}, {8, LineKind::Call, 2},     {8, LineKind::Label, 2},
                      {8, LineKind::Expanded, 2}, {8, LineKind::Expanded, 2}, {9, LineKind::Verbatim, 0},
                      {10, LineKind::Verbatim, 0}};
  CHECK(r.lineMap.size() == 10);
  for (std::size_t i = 0; i < r.lineMap.size() && i < 10; ++i) {
    const LineOrigin& o = r.lineMap[i];
    CHECK(o.output == static_cast<int>(i) + 1 && o.source == rows[i].source && o.kind == rows[i].kind &&
          o.serial == rows[i].serial);
  }
  CHECK(r.expansions.size() == 2);
  if (r.expansions.size() != 2) return;
  const Expansion& e = r.expansions[0];
  CHECK(e.serial == 1 && e.macro == "DOBRA" && e.definition == 0 && e.parent == 0 && e.depth == 1);
  CHECK(e.callLine == 7 && e.callText == "        DOBRA N");
  CHECK(e.outputFrom == 2 && e.outputTo == 4);
  CHECK(r.expansions[1].serial == 2 && r.expansions[1].outputFrom == 5 && r.expansions[1].outputTo == 8);
}

// ---------------------------------------------------------------------------
// Nested calls and definitions created by an expansion
static const char SCALE_DEFINITION[] =   // slides 40-41, column 1
    "MCDEFN\nSCALE RP\nMCDEFN\nMULTSC A,B,C\nLOAD A\nMULT B\nSHIFTR RP\nSTORE C\nMCEND\n"
    "MCDEFN\nDIVSC A,B,C\nLOAD A\nMULT B\nSHIFTL RP\nSTORE C\nMCEND\nMCEND\n";

// The active definition called `name`, or null.
static const MacroDefinition* activeDefinition(const MacroResult& r, const std::string& name) {
  for (const MacroName& n : r.names)
    if (n.name == name && n.definition >= 0 && n.definition < static_cast<int>(r.definitions.size()))
      return &r.definitions[static_cast<std::size_t>(n.definition)];
  return nullptr;
}

TEST(exercise2_nested_definition_keywords) {   // SOLUCAO_MACRO2 ex.2, column 1 as written
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  auto r = MacroProcessor(o).process(
      "MCDEFN\nOUTER A=,B=\nMCDEFN\nINNER A=,C=\nLOAD A\nMULT C\nMULT @4\nSTORE *+4\nBR *+3\nSPACE\nLOAD B\n"
      "MULT B\nSUB *-5\nMCEND\nSTORE A\nMCEND\nOUTER B=BRAVO, A=DELTA\nINNER A=ALFA, C=CHARLIE\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"STORE DELTA", "LOAD ALFA",
        "MULT CHARLIE", "MULT @4", "STORE *+4", "BR *+3", "SPACE", "LOAD BRAVO", "MULT BRAVO", "SUB *-5"}));
  const MacroDefinition* inner = activeDefinition(r, "INNER");
  CHECK(inner != nullptr);
  if (!inner) return;
  CHECK(inner->originSerial == 1);
  CHECK((display(*inner) == std::vector<std::string>{"INNER A=,C=", "LOAD #1", "MULT #2", "MULT @4",
        "STORE *+4", "BR *+3", "SPACE", "LOAD BRAVO", "MULT BRAVO", "SUB *-5", "MCEND"}));
}

// Figure 4.12, lines 1-10.
static const char FIGURE_4_12_INPUT[] =
    "MCDEFN\nA FORMAL1\nLOAD FORMAL1\nMCDEFN\nB FORMAL2\nSTORE FORMAL2\nMCEND\nMCEND\nA ACTUAL1\nB ACTUAL2\n";

TEST(figure_4_12_outputs) {
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  auto r = MacroProcessor(o).process(FIGURE_4_12_INPUT);
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"LOAD ACTUAL1", "STORE ACTUAL2"}));
  CHECK(r.definitions.size() == 2); CHECK(r.names.size() == 2);
  if (r.definitions.size() != 2 || r.names.size() != 2) return;
  const MacroDefinition& b = r.definitions[1];
  CHECK(b.name == "B"); CHECK(b.active); CHECK(!b.hasNested);
  CHECK(b.originSerial == 1); CHECK(b.originSourceLine == 0);
  CHECK((display(b) == std::vector<std::string>{"B FORMAL2", "STORE #1", "MCEND"}));
  CHECK((b.bodySourceLines == std::vector<int>{0, 0, 0}));   // not from the source
  CHECK(r.names[1].name == "B" && r.names[1].definition == 1 && r.names[1].line == 0);
  CHECK(r.definitions[0].originSerial == 0);
}

TEST(figure_4_10_three_level_expansion) {   // each expansion shifts #(k,i) to #(k-1,i): 3 -> 2 -> 1
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  auto r = MacroProcessor(o).process(std::string(FIGURE_4_10_DEFINITION) + "X 1,2,3,4\nY 5,6,7,8\nZ 9,10,11,12\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"1,2,3,4", "E,F,G,H", "5,6,3,4", "7,8,G,H",
        "9,6,10,4", "11,8,12,H"}));
  const MacroDefinition* y = activeDefinition(r, "Y");
  const MacroDefinition* z = activeDefinition(r, "Z");
  CHECK(y != nullptr); CHECK(z != nullptr);
  if (!y || !z) return;
  CHECK(y->originSerial == 1 && z->originSerial == 2);
  CHECK((display(*y) == std::vector<std::string>{"Y A,B,E,F", "#(1,1),#(1,2),3,4", "MCDEFN", "Z A,C,E,G",
        "#(2,1),#(1,2),#(2,2),4", "#(2,3),#(1,4),#(2,4),H", "MCEND", "#(1,3),#(1,4),G,H", "MCEND"}));
  CHECK((display(*z) == std::vector<std::string>{"Z A,C,E,G", "#1,6,#2,4", "#3,8,#4,H", "MCEND"}));
}

TEST(scale_defines_multsc_and_divsc) {   // slides 40-41
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  auto r = MacroProcessor(o).process(std::string(SCALE_DEFINITION) + "SCALE 3\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Call) == std::vector<std::string>{".SCALE 3"}));
  CHECK(outputLines(r, LineKind::Expanded).empty());
  const MacroDefinition* mult = activeDefinition(r, "MULTSC");
  const MacroDefinition* div = activeDefinition(r, "DIVSC");
  CHECK(mult != nullptr); CHECK(div != nullptr);
  if (!mult || !div) return;
  CHECK(mult->originSerial == 1 && div->originSerial == 1);
  CHECK((display(*mult) == std::vector<std::string>{"MULTSC A,B,C", "LOAD #1", "MULT #2", "SHIFTR 3", "STORE #3",
        "MCEND"}));
  CHECK((display(*div) == std::vector<std::string>{"DIVSC A,B,C", "LOAD #1", "MULT #2", "SHIFTL 3", "STORE #3",
        "MCEND"}));
}

TEST(discr_nested_calls) {   // slides 43-45
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  auto r = MacroProcessor(o).process(
      std::string(SCALE_DEFINITION) +   // lines 1-17
      "MCDEFN\nDISCR A,B,C,D\nMULTSC A,C,TEMP1\nMULTSC TEMP1,@4,TEMP1\nMULTSC B,B,TEMP2\nSUB TEMP1\nSTORE D\n"
      "MCEND\nSCALE 3\nDISCR P,Q,R,S\n");   // the DISCR call is line 27
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"LOAD P", "MULT R", "SHIFTR 3",
        "STORE TEMP1", "LOAD TEMP1", "MULT @4", "SHIFTR 3", "STORE TEMP1", "LOAD Q", "MULT Q", "SHIFTR 3",
        "STORE TEMP2", "SUB TEMP1", "STORE S"}));
  // Every nested call is a '.' comment, with its actuals in place.
  CHECK((outputLines(r, LineKind::Call) == std::vector<std::string>{".SCALE 3", ".DISCR P,Q,R,S",
        ".MULTSC P,R,TEMP1", ".MULTSC TEMP1,@4,TEMP1", ".MULTSC Q,Q,TEMP2"}));

  // lineMap: the source is the outermost call, the serial the innermost expansion.
  const std::vector<int> serials = {1, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 2, 2, 0};
  CHECK(r.lineMap.size() == serials.size());
  for (std::size_t i = 0; i < r.lineMap.size() && i < serials.size(); ++i) {
    const LineOrigin& line = r.lineMap[i];
    const int source = i == 0 ? 26 : i == 19 ? 28 : 27;
    CHECK(line.serial == serials[i] && line.source == source);
  }

  // Nested ranges lie inside DISCR's, from each call comment to the last body line.
  struct Row { int serial; const char* macro; int parent, depth, callLine; const char* callText; int from, to; };
  const Row rows[] = {{1, "SCALE", 0, 1, 26, "SCALE 3", 1, 1},
                      {2, "DISCR", 0, 1, 27, "DISCR P,Q,R,S", 2, 19},
                      {3, "MULTSC", 2, 2, 27, "MULTSC P,R,TEMP1", 3, 7},
                      {4, "MULTSC", 2, 2, 27, "MULTSC TEMP1,@4,TEMP1", 8, 12},
                      {5, "MULTSC", 2, 2, 27, "MULTSC Q,Q,TEMP2", 13, 17}};
  CHECK(r.expansions.size() == 5);
  for (std::size_t i = 0; i < r.expansions.size() && i < 5; ++i) {
    const Expansion& e = r.expansions[i];
    const Row& w = rows[i];
    CHECK(e.serial == w.serial && e.macro == w.macro && e.parent == w.parent && e.depth == w.depth &&
          e.callLine == w.callLine && e.callText == w.callText && e.outputFrom == w.from && e.outputTo == w.to);
  }
}

TEST(serial_in_nested_expansions) {   // spec 4.3: .SER is the serial of the expansion that outputs the line
  auto r = MacroProcessor().process(
      "MCDEFN\nOUTER\nMCDEFN\nGEN V\nH.SER LDA V\nMCEND\nJ.SER LDA X\nGEN L.SER\nMCEND\nOUTER\nGEN Z\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"J001 LDA X", "H002 LDA L001",
        "H003 LDA Z"}));
  CHECK((outputLines(r, LineKind::Call) == std::vector<std::string>{".OUTER", ".GEN L001", ".GEN Z"}));
  const MacroDefinition* gen = activeDefinition(r, "GEN");   // a stored line keeps .SER
  CHECK(gen != nullptr);
  if (gen) CHECK((display(*gen) == std::vector<std::string>{"GEN V", "H.SER LDA #1", "MCEND"}));
}

TEST(redefinition_inside_expansion) {   // same rule as in the source
  auto r = MacroProcessor().process(
      "MCDEFN\nM\n        LDA X\nMCEND\nMCDEFN\nREDEF\nMCDEFN\nM\n        LDA Y\nMCEND\nMCEND\n"
      "        M\n        REDEF\n        M\n");
  CHECK(r.ok());
  CHECK((outputLines(r, LineKind::Expanded) == std::vector<std::string>{"LDA X", "LDA Y"}));
  CHECK(r.definitions.size() == 3); CHECK(r.names.size() == 2);
  if (r.definitions.size() != 3 || r.names.empty()) return;
  CHECK(!r.definitions[0].active); CHECK(r.definitions[2].active); CHECK(r.definitions[2].originSerial == 2);
  CHECK(r.names[0].name == "M" && r.names[0].definition == 2);
}

TEST(nested_crlf) {   // generated lines end like the outermost call line
  const std::string src = "MCDEFN\r\nINNER V\r\n        LDA V\r\nMCEND\r\nMCDEFN\r\nOUTER W\r\n        INNER W\r\n"
                          "MCEND\r\n        OUTER 5\r\n        OUTER 6\n";
  auto r = MacroProcessor().process(src);
  CHECK(r.ok());
  CHECK(r.text == ".        OUTER 5\r\n.        INNER 5\r\n        LDA 5\r\n"
                  ".        OUTER 6\n.        INNER 6\n        LDA 6\n");
}

// ---------------------------------------------------------------------------
// Limits (spec 4.4): each one is an error that stops the processing
TEST(recursion_limit) {
  auto r = MacroProcessor().process("        MCDEFN\n        R\n        LDA X\n        R\n        MCEND\n"
                                    "        R\n        END P\n");
  CHECK(!r.ok()); CHECK(r.expansions.size() == 64);
  CHECK(r.diagnostics.size() == 1);
  if (!r.diagnostics.empty()) {   // at the macro name of the outermost call
    const Diagnostic& d = r.diagnostics[0];
    CHECK(d.message == "Macro expansion too deep (limit 64): R");
    CHECK(d.line == 6 && d.column == 9 && d.length == 1);
  }
  CHECK(r.text.find("END P") == std::string::npos);
}

TEST(expansion_limit) {
  MacroProcessorOptions o; o.maxExpansions = 5;
  auto r = MacroProcessor(o).process("MCDEFN\nINNER\n        LDA X\nMCEND\nMCDEFN\nOUTER\n        INNER\n"
                                     "        INNER\nMCEND\n        OUTER\n        OUTER\n        END P\n");
  CHECK(!r.ok()); CHECK(r.expansions.size() == 5);   // OUTER, INNER, INNER, OUTER, INNER
  CHECK(r.diagnostics.size() == 1);
  if (!r.diagnostics.empty()) {   // the sixth is nested in the second OUTER, line 11
    const Diagnostic& d = r.diagnostics[0];
    CHECK(d.message == "Too many macro expansions (limit 5)");
    CHECK(d.line == 11 && d.column == 9 && d.length == 5);
  }
  CHECK(r.text.find("END P") == std::string::npos);
  if (r.expansions.size() == 5) CHECK(r.expansions[3].outputTo == static_cast<int>(r.lineMap.size()));
}

TEST(output_limit) {
  MacroProcessorOptions o; o.maxOutputLines = 4;
  auto r = MacroProcessor(o).process("P START 0\nMCDEFN\nM\n        LDA X\n        LDA Y\nMCEND\n        M\n"
                                     "        M\n        END P\n");
  CHECK(!r.ok());
  CHECK(r.text == "P START 0\n.        M\n        LDA X\n        LDA Y");
  CHECK(r.lineMap.size() == 4);
  CHECK(r.diagnostics.size() == 1);
  if (!r.diagnostics.empty()) {
    const Diagnostic& d = r.diagnostics[0];
    CHECK(d.message == "Macro output too long (limit 4 lines)");
    CHECK(d.line == 8 && d.column == 9 && d.length == 1);
  }
}

// ---------------------------------------------------------------------------
// Trace (spec 4.4, Figure 4.12): one step per line read

// "s9" for source line 9, "x2" for body line 2 of an expansion's definition.
static std::string readTag(const TraceStep& s) { return (s.fromExpansion ? "x" : "s") + std::to_string(s.line); }

TEST(figure_4_12_trace) {
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  auto r = MacroProcessor(o).process(FIGURE_4_12_INPUT);
  CHECK(r.ok()); CHECK(!r.trace.truncated);
  const std::vector<TraceStep>& steps = r.trace.steps;
  std::vector<std::string> reads;
  std::vector<int> ds;
  std::vector<bool> es;
  for (const TraceStep& s : steps) {
    reads.push_back(readTag(s));
    ds.push_back(s.d);
    es.push_back(s.e);
  }
  CHECK((reads == std::vector<std::string>{"s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "x1", "x2", "x3",
        "x4", "x5", "x6", "x7", "s10", "x1", "x2", "x3"}));
  CHECK((ds == std::vector<int>{0, 1, 1, 1, 2, 2, 2, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0}));
  for (std::size_t i = 0; i < es.size(); ++i) CHECK(es[i] == !(i < 9 || i == 16));
  if (steps.size() != 20) return;
  CHECK(steps[9].action == TraceAction::ReadPrototype);
  CHECK(steps[10].action == TraceAction::Copy);
  CHECK(steps[16].action == TraceAction::Call);

  // Every action and its target. A nested definition is stored as text: its MCDEFN,
  // prototype and MCEND are Store into A (definition 0) until A is expanded.
  struct Row { TraceAction action; int output, definition, bodyLine, serial; };
  using A = TraceAction;
  const Row rows[] = {{A::DefineStart, 0, 0, 0, 0},   {A::Prototype, 0, 0, 1, 0},   {A::Store, 0, 0, 2, 0},
                      {A::Store, 0, 0, 3, 0},         {A::Store, 0, 0, 4, 0},       {A::Store, 0, 0, 5, 0},
                      {A::Store, 0, 0, 6, 0},         {A::DefineEnd, 0, 0, 7, 0},   {A::Call, 0, 0, 0, 1},
                      {A::ReadPrototype, 0, 0, 0, 0}, {A::Copy, 2, 0, 0, 0},        {A::DefineStart, 0, 0, 0, 0},
                      {A::Prototype, 0, 1, 1, 0},     {A::Store, 0, 1, 2, 0},       {A::DefineEnd, 0, 1, 3, 0},
                      {A::ExpansionEnd, 0, 0, 0, 0},  {A::Call, 0, 0, 0, 2},        {A::ReadPrototype, 0, 0, 0, 0},
                      {A::Copy, 4, 0, 0, 0},          {A::ExpansionEnd, 0, 0, 0, 0}};
  for (std::size_t i = 0; i < 20; ++i) {
    const TraceStep& s = steps[i];
    const Row& w = rows[i];
    CHECK(s.step == static_cast<int>(i) + 1);
    CHECK(s.action == w.action && s.targetOutput == w.output && s.targetDefinition == w.definition &&
          s.targetBodyLine == w.bodyLine && s.targetSerial == w.serial);
  }

  // A source line as written; an expansion line as substituted, which is what the algorithm processes.
  CHECK(steps[2].text == "LOAD FORMAL1"); CHECK(steps[9].text == "A FORMAL1");
  CHECK(steps[10].text == "LOAD ACTUAL1"); CHECK(steps[13].text == "STORE #(1,1)");
  CHECK(steps[18].text == "STORE ACTUAL2"); CHECK(steps[19].text == "MCEND");
  CHECK(steps[9].serial == 1 && steps[9].depth == 1); CHECK(steps[17].serial == 2 && steps[17].depth == 1);
  CHECK(steps[16].serial == 0 && steps[16].depth == 0);

  // The empty segment after the final newline is not a line of the figure.
  const std::string noFinalNewline(FIGURE_4_12_INPUT, sizeof(FIGURE_4_12_INPUT) - 2);
  CHECK(MacroProcessor(o).process(noFinalNewline).trace.steps.size() == 20);
}

TEST(scale_level_sequence) {   // slides 40-41: d before each MCDEFN / MCEND of the source
  MacroProcessorOptions o; o.isOperation = calingaertOps();
  auto r = MacroProcessor(o).process(std::string(SCALE_DEFINITION) + "SCALE 3\n");
  CHECK(r.ok());
  std::vector<int> levels;
  for (const TraceStep& s : r.trace.steps)
    if (!s.fromExpansion && (squash(s.text) == "MCDEFN" || squash(s.text) == "MCEND")) levels.push_back(s.d);
  CHECK((levels == std::vector<int>{0, 1, 2, 1, 2, 1}));
}

TEST(trace_truncation) {   // past maxTraceSteps the trace stops growing, with no error
  MacroProcessorOptions o; o.isOperation = calingaertOps(); o.maxTraceSteps = 3;
  auto r = MacroProcessor(o).process(FIGURE_4_12_INPUT);
  CHECK(r.trace.steps.size() == 3); CHECK(r.trace.truncated); CHECK(r.ok());
  MacroProcessorOptions full; full.isOperation = calingaertOps();
  CHECK(r.text == MacroProcessor(full).process(FIGURE_4_12_INPUT).text);
}

TEST(trace_error_steps) {   // the line that causes an error is an Error step, with no target
  MacroProcessorOptions o; o.maxDepth = 2;
  auto r = MacroProcessor(o).process(
      "        MCEND\n"                                                       // 1: MCEND without MCDEFN
      "        MCDEFN\n        LDA X\n        ADD X\n        MCEND\n"          // 2-5: LDA cannot be a name
      "        MCDEFN\n        R\n        LDA X\n        R\n        MCEND\n"   // 6-10
      "        R\n        END P\n");                                          // 11: too deep at depth 3
  CHECK(!r.ok());
  const std::vector<TraceStep>& steps = r.trace.steps;
  CHECK(steps.size() == 17);   // 11 source lines and 6 read from expansions; line 12 is never read
  if (steps.size() != 17) return;
  using A = TraceAction;
  const A actions[] = {A::Error,     A::DefineStart, A::Error,         A::Store,     A::DefineEnd, A::DefineStart,
                       A::Prototype, A::Store,       A::Store,         A::DefineEnd, A::Call,      A::ReadPrototype,
                       A::Copy,      A::Call,        A::ReadPrototype, A::Copy,      A::Error};
  for (std::size_t i = 0; i < 17; ++i) CHECK(steps[i].action == actions[i]);
  for (const TraceStep* s : {&steps[0], &steps[2], &steps[16]})
    CHECK(s->targetOutput == 0 && s->targetDefinition == 0 && s->targetBodyLine == 0 && s->targetSerial == 0);
  // LDA was not entered in the tables, so lines stored in it have no target, and R is definition 0.
  CHECK(steps[3].targetBodyLine == 0 && steps[4].targetBodyLine == 0);
  CHECK(steps[6].targetDefinition == 0 && steps[6].targetBodyLine == 1);
  CHECK(steps[9].targetDefinition == 0 && steps[9].targetBodyLine == 4);
  CHECK(steps[13].targetSerial == 2 && steps[15].targetOutput == 4);
  CHECK(readTag(steps[16]) == "x3" && steps[16].serial == 2 && steps[16].depth == 2 && steps[16].e);
}

TEST(trace_comment_before_prototype) {   // dropped at level 1 (no target), stored at level 2
  auto r = MacroProcessor().process("        MCDEFN\n; before OUTER\n\n        OUTER\n        MCDEFN\n"
                                    ". before INNER\n        INNER\n        LDA #1\n        MCEND\n        MCEND\n");
  CHECK(r.ok());
  const std::vector<TraceStep>& steps = r.trace.steps;
  CHECK(steps.size() == 10);
  if (steps.size() != 10) return;
  for (const TraceStep* s : {&steps[1], &steps[2]})
    CHECK(s->action == TraceAction::Store && s->targetDefinition == 0 && s->targetBodyLine == 0);
  CHECK(steps[1].text == "; before OUTER" && steps[2].text.empty());
  CHECK(steps[3].action == TraceAction::Prototype && steps[3].targetBodyLine == 1);
  CHECK(steps[5].action == TraceAction::Store && steps[5].targetDefinition == 0 && steps[5].targetBodyLine == 3);
  CHECK(steps[5].d == 2 && steps[5].text == ". before INNER");
}

TEST(trace_unclosed_definition_loses_targets) {   // never entered in the tables
  auto r = MacroProcessor().process("        MCDEFN\n        M\n        LDA #1\n");
  CHECK(!r.ok()); CHECK(r.definitions.empty());
  const std::vector<TraceStep>& steps = r.trace.steps;
  CHECK(steps.size() == 3);
  if (steps.size() != 3) return;
  CHECK(steps[0].action == TraceAction::DefineStart);
  CHECK(steps[1].action == TraceAction::Prototype && steps[1].targetBodyLine == 0);
  CHECK(steps[2].action == TraceAction::Store && steps[2].targetBodyLine == 0);
}

TEST(trace_crlf_text) {   // a step's text never carries the '\r' of a CRLF source
  auto r = MacroProcessor().process("P START 0\r\n MCDEFN\r\n M\r\n LDA #1\r\n MCEND\r\n M\r\n END P\r\n");
  CHECK(r.ok());
  const std::vector<TraceStep>& steps = r.trace.steps;
  CHECK(steps.size() == 10);   // 7 source lines and 3 read from the expansion
  for (const TraceStep& s : steps) CHECK(s.text.find('\r') == std::string::npos);
  if (steps.size() != 10) return;
  CHECK(steps[0].text == "P START 0" && steps[5].text == " M");
  CHECK(steps[7].fromExpansion && steps[7].text == " LDA #1");
}

// ---------------------------------------------------------------------------
// Assembler diagnostics moved from MASMAPRG.ASM to the source (spec 5), and the demo program (spec 7)

// Prints the diagnostics when a check on them fails.
static void dump(const char* what, const std::vector<Diagnostic>& ds) {
  std::printf("  (%s:\n", what);
  for (const Diagnostic& d : ds) std::printf("    %s [length %d]\n", d.toString().c_str(), d.length);
  std::printf("  )\n");
}

TEST(assembler_error_in_expansion_maps_to_call) {
  const std::string src = "PROG    START 0\n        MCDEFN\n        CARREGA\n        LDA NAOEXISTE\n"
                          "        MCEND\n        LDA #1\nAQUI    CARREGA\n        END PROG\n";
  auto r = MacroProcessor().process(src);
  CHECK(r.ok());
  const std::vector<Diagnostic> assembled = Assembler().assembleDetailed(r.text).info.diagnostics;
  CHECK(assembled.size() == 1);
  if (assembled.size() != 1) {
    dump("assembled", assembled);
    return;
  }
  CHECK(assembled[0].line == 5);   // the body line in MASMAPRG.ASM, after the call comment and AQUI EQU *
  const std::vector<Diagnostic> mapped = remapAssemblyDiagnostics(r, src, assembled);
  CHECK(mapped.size() == 1);
  if (mapped.size() != 1) return;
  const Diagnostic& d = mapped[0];
  CHECK(d.line == 7 && d.column == 9 && d.length == 7);   // CARREGA on the call line
  CHECK(d.severity == Severity::Error);
  CHECK(d.message.rfind("In expansion of", 0) == 0);
  CHECK(d.message == "In expansion of CARREGA (#001, MASMAPRG.ASM:5): " + assembled[0].message);

  const SourceSpan body = mapToSource(r, src, 5, 13, 9);
  CHECK(body.line == 7 && body.column == 9 && body.length == 7 && body.synthetic);
  const SourceSpan copied = mapToSource(r, src, 2, 9, 3);
  CHECK(copied.line == 6 && copied.column == 9 && copied.length == 3 && !copied.synthetic);
  // CRLF: CARREGA ends its line, so a '\r' left on it would hide the name.
  const std::string crlf = "PROG    START 0\r\n        MCDEFN\r\n        CARREGA\r\n        LDA NAOEXISTE\r\n"
                           "        MCEND\r\n        LDA #1\r\nAQUI    CARREGA\r\n        END PROG\r\n";
  const SourceSpan crlfBody = mapToSource(MacroProcessor().process(crlf), crlf, 5, 13, 9);
  CHECK(crlfBody.line == 7 && crlfBody.column == 9 && crlfBody.length == 7 && crlfBody.synthetic);

  // A nested call: the message names the innermost expansion, the span is the outermost call.
  const std::string nested = "PROG START 0\nMCDEFN\nINTERNA\n LDA NAOEXISTE\nMCEND\nMCDEFN\nEXTERNA\n INTERNA\n"
                             "MCEND\nL1   externa   ; lower case\n END PROG\n";
  auto n = MacroProcessor().process(nested);
  CHECK(n.ok());
  const std::vector<Diagnostic> inner = Assembler().assembleDetailed(n.text).info.diagnostics;
  CHECK(inner.size() == 1);
  if (inner.size() != 1) {
    dump("assembled", inner);
    return;
  }
  CHECK(inner[0].line == 5);
  const std::vector<Diagnostic> innerMapped = remapAssemblyDiagnostics(n, nested, inner);
  CHECK(innerMapped.size() == 1);
  if (innerMapped.size() != 1) return;
  CHECK(innerMapped[0].line == 10 && innerMapped[0].column == 6 && innerMapped[0].length == 7);
  CHECK(innerMapped[0].message == "In expansion of INTERNA (#002, MASMAPRG.ASM:5): " + inner[0].message);
}

TEST(verbatim_error_keeps_column) {
  const std::string src = "PROG    START 0\n        MCDEFN\n        M\n        LDA #1\n        MCEND\n"
                          "        LDA     NAOEXISTE\n        END PROG\n";
  auto r = MacroProcessor().process(src);
  CHECK(r.ok());
  const std::vector<Diagnostic> assembled = Assembler().assembleDetailed(r.text).info.diagnostics;
  CHECK(assembled.size() == 1);
  if (assembled.size() != 1) {
    dump("assembled", assembled);
    return;
  }
  CHECK(assembled[0].line == 2 && assembled[0].column == 17);
  const std::vector<Diagnostic> mapped = remapAssemblyDiagnostics(r, src, assembled);
  CHECK(mapped.size() == 1);
  if (mapped.size() != 1) return;
  CHECK(mapped[0].line == 6);
  CHECK(mapped[0].column == assembled[0].column && mapped[0].length == assembled[0].length);
  CHECK(mapped[0].message == assembled[0].message && mapped[0].severity == assembled[0].severity);
}

TEST(remapped_message_line_numbers) {   // "first defined on line N" follows; "Missing END directive" never changes
  const std::string src = "PROG    START 0\n        MCDEFN\nL       ROTULA V\nL       LDA V\n        MCEND\n"
                          "DUP     ROTULA #1\nDUP     LDA #2\nW       WORD 1\nW       ROTULA #2\n";
  auto r = MacroProcessor().process(src);
  CHECK(r.ok());
  const std::vector<Diagnostic> assembled = Assembler().assembleDetailed(r.text).info.diagnostics;
  CHECK(assembled.size() == 3);
  if (assembled.size() != 3) {
    dump("assembled", assembled);
    return;
  }
  const std::vector<Diagnostic> mapped = remapAssemblyDiagnostics(r, src, assembled);
  CHECK(mapped.size() == 3);
  if (mapped.size() != 3) return;
  // DUP first defined by the expansion of line 6 (MASMAPRG.ASM:3), again on the verbatim line 7.
  CHECK(assembled[0].message == "Duplicate symbol 'DUP' (first defined on line 3)");
  CHECK(mapped[0].line == 7 && mapped[0].column == 1);
  CHECK(mapped[0].message == "Duplicate symbol 'DUP' (first defined on line 6)");
  // W first defined on the verbatim line 8 (MASMAPRG.ASM:5), again by the expansion of line 9.
  CHECK(mapped[1].line == 9 && mapped[1].column == 9 && mapped[1].length == 6);
  CHECK(mapped[1].message ==
        "In expansion of ROTULA (#002, MASMAPRG.ASM:7): Duplicate symbol 'W' (first defined on line 8)");
  // No END: the warning sits on the last statement, an expansion line, and keeps its exact message.
  CHECK(assembled[2].severity == Severity::Warning && assembled[2].line == 7);
  CHECK(mapped[2].message == "Missing END directive" && mapped[2].line == 9);
}

TEST(demo_program_expands_and_assembles) {   // spec 7: label formal, keywords, .SER, nested call and definition
  std::ifstream in(SICXE_DEMO_ASM, std::ios::binary);
  CHECK(in.good());
  std::ostringstream text;
  text << in.rdbuf();
  const std::string src = text.str();
  auto r = MacroProcessor().process(src);
  CHECK(r.ok());
  if (!r.ok()) dump("macro processor", r.diagnostics);
  const AssemblyResult a = Assembler().assembleDetailed(r.text);
  CHECK(a.ok());
  if (!a.ok()) dump("assembler, remapped", remapAssemblyDiagnostics(r, src, a.info.diagnostics));
  for (const char* symbol : {"FIM003", "N", "MAIOR", "TRIPLO"}) CHECK(a.info.symbols.count(symbol) == 1);
  std::vector<std::string> macros;
  for (const Expansion& e : r.expansions) macros.push_back(e.macro);
  CHECK((macros == std::vector<std::string>{"DOBRA", "SOMA", "MAXIMO", "ESCALA", "MULTK"}));
  const MacroDefinition* multk = activeDefinition(r, "MULTK");
  CHECK(multk != nullptr && multk->originSerial == 4);
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
