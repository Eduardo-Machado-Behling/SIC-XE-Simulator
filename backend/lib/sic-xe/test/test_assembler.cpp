// Dependency-free test runner (swap for GoogleTest/Catch2 in a real project).
// Expected bytes below were derived by hand from Beck's encoding rules.
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

#include "assembler/assembler.hpp"
#include "memory/CodeMemory.hpp"

using namespace sicxe;
using Bytes = std::vector<int>;

static int g_failures = 0, g_checks = 0;
#define CHECK(cond)                                                              \
  do {                                                                           \
    ++g_checks;                                                                  \
    if (!(cond)) { ++g_failures; std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)

static Bytes bytesAt(const CodeMemory& m, std::size_t addr, std::size_t n) {
  Bytes out;
  for (std::size_t i = 0; i < n; ++i) { auto b = m.read(addr + i); out.push_back(b ? *b : -1); }
  return out;
}

static std::string errorsOf(const std::string& src, AssemblerOptions o = {}) {
  auto r = Assembler(o).assembleDetailed(src);
  std::string s;
  for (auto& d : r.info.diagnostics) if (d.severity == Severity::Error) s += d.toString() + "\n";
  return s;
}
static bool hasError(const std::string& src, const std::string& needle, AssemblerOptions o = {}) {
  const std::string e = errorsOf(src, o);
  if (e.find(needle) == std::string::npos) std::printf("  (got: %s)\n", e.c_str());
  return e.find(needle) != std::string::npos;
}

#define TEST(name) static void name(); static Registrar r_##name(#name, name); static void name()
struct Registrar { Registrar(const char* n, void (*f)()); };
static std::vector<std::pair<const char*, void (*)()>>& registry() { static std::vector<std::pair<const char*, void (*)()>> r; return r; }
Registrar::Registrar(const char* n, void (*f)()) { registry().push_back({n, f}); }

// ---------------------------------------------------------------------------
TEST(code_memory_is_sparse_and_merges) {
  CodeMemory m;
  for (int i = 0; i < 128; ++i) m.write(i, 0xAA);
  for (int i = 0; i < 10; ++i) m.write(0x1000 + i, 0xBB);
  CHECK(m.segments().size() == 2);
  CHECK(m.byteCount() == 138);
  m.write(0x0FFF, 1); m.write(128, 2);           // grow downward / upward
  CHECK(m.segments().size() == 2);
  for (int a = 129; a < 0x0FFF; ++a) m.write(a, 0);
  CHECK(m.segments().size() == 1);               // bridged into one block
  CHECK(*m.read(0x1000) == 0xBB && !m.read(0x2000));
  m.clear();
  CHECK(m.empty());
}

TEST(spec_example_style_program) {
  const char* src =
      "      START 0\n"
      "      LDA   #5\n"        // 0000: 01 00 05
      "      LDA   VAL\n"       // 0003: 03 20 0A   (16 - 6)
      "      STA   VAL,X\n"     // 0006: 0F A0 07   (16 - 9)
      "      +JSUB SUBRTN\n"    // 0009: 4B 10 00 13
      "      RSUB\n"            // 000D: 4F 00 00
      "VAL   WORD  42\n"        // 0010: 00 00 2A
      "SUBRTN RSUB\n"           // 0013: 4F 00 00
      "      END\n";
  Assembler a;
  CodeMemory m = a.assemble(src);
  CHECK(bytesAt(m, 0x00, 3) == (Bytes{0x01, 0x00, 0x05}));
  CHECK(bytesAt(m, 0x03, 3) == (Bytes{0x03, 0x20, 0x0A}));
  CHECK(bytesAt(m, 0x06, 3) == (Bytes{0x0F, 0xA0, 0x07}));
  CHECK(bytesAt(m, 0x09, 4) == (Bytes{0x4B, 0x10, 0x00, 0x13}));
  CHECK(bytesAt(m, 0x0D, 3) == (Bytes{0x4F, 0x00, 0x00}));
  CHECK(bytesAt(m, 0x10, 3) == (Bytes{0x00, 0x00, 0x2A}));
  CHECK(bytesAt(m, 0x13, 3) == (Bytes{0x4F, 0x00, 0x00}));
  CHECK(m.segments().size() == 1);
  CHECK(a.lastInfo().length == 0x16);
  CHECK(a.lastInfo().relocations.size() == 1 && a.lastInfo().relocations[0].address == 0x0A);
}

TEST(formats_1_and_2) {
  CodeMemory m = Assembler().assemble(
      " CLEAR X\n COMPR A,S\n SHIFTL A,4\n SHIFTR T,16\n SVC 3\n TIXR T\n FIX\n");
  CHECK(bytesAt(m, 0, 2) == (Bytes{0xB4, 0x10}));
  CHECK(bytesAt(m, 2, 2) == (Bytes{0xA0, 0x04}));
  CHECK(bytesAt(m, 4, 2) == (Bytes{0xA4, 0x03}));
  CHECK(bytesAt(m, 6, 2) == (Bytes{0xA8, 0x5F}));
  CHECK(bytesAt(m, 8, 2) == (Bytes{0xB0, 0x30}));
  CHECK(bytesAt(m, 10, 2) == (Bytes{0xB8, 0x50}));
  CHECK(bytesAt(m, 12, 1) == (Bytes{0xC4}));
}

TEST(all_format1_opcodes_match_the_sicxe_instruction_table) {
  const std::vector<std::pair<std::string, int>> instructions = {
      {"FIX", 0xC4}, {"FLOAT", 0xC0}, {"HALT", 0xFC}, {"HIO", 0xF4},
      {"NORM", 0xC8}, {"SIO", 0xF0}, {"TIO", 0xF8}};

  for (std::size_t i = 0; i < instructions.size(); ++i) {
    const auto& [mnemonic, opcode] = instructions[i];
    const CodeMemory image = Assembler().assemble(" " + mnemonic + "\n");
    CHECK(bytesAt(image, 0, 1) == Bytes{opcode});
  }
}

TEST(all_format2_operand_schemas_encode_registers_and_counts) {
  const CodeMemory image = Assembler().assemble(
      " ADDR A,S\n"
      " CLEAR F\n"
      " COMPR T,PC\n"
      " DIVR S,T\n"
      " MULR L,F\n"
      " RMO SW,A\n"
      " SHIFTL A,1\n"
      " SHIFTR F,16\n"
      " SUBR X,B\n"
      " SVC 15\n"
      " TIXR L\n");

  CHECK(bytesAt(image, 0, 22) == (Bytes{
      0x90, 0x04, 0xB4, 0x60, 0xA0, 0x58, 0x9C, 0x45,
      0x98, 0x26, 0xAC, 0x90, 0xA4, 0x00, 0xA8, 0x6F,
      0x94, 0x13, 0xB0, 0xF0, 0xB8, 0x20}));
}

TEST(all_memory_instruction_opcodes_match_the_sicxe_instruction_table) {
  const std::vector<std::pair<std::string, int>> instructions = {
      {"ADD", 0x18}, {"ADDF", 0x58}, {"AND", 0x40}, {"COMP", 0x28},
      {"COMPF", 0x88}, {"DIV", 0x24}, {"DIVF", 0x64}, {"J", 0x3C},
      {"JEQ", 0x30}, {"JGT", 0x34}, {"JLT", 0x38}, {"JSUB", 0x48},
      {"LDA", 0x00}, {"LDB", 0x68}, {"LDCH", 0x50}, {"LDF", 0x70},
      {"LDL", 0x08}, {"LDS", 0x6C}, {"LDT", 0x74}, {"LDX", 0x04},
      {"LPS", 0xD0}, {"MUL", 0x20}, {"MULF", 0x60}, {"OR", 0x44},
      {"RD", 0xD8}, {"SSK", 0xEC}, {"STA", 0x0C}, {"STB", 0x78},
      {"STCH", 0x54}, {"STF", 0x80}, {"STI", 0xD4}, {"STL", 0x14},
      {"STS", 0x7C}, {"STSW", 0xE8}, {"STT", 0x84}, {"STX", 0x10},
      {"SUB", 0x1C}, {"SUBF", 0x5C}, {"TD", 0xE0}, {"TIX", 0x2C},
      {"WD", 0xDC}};

  std::string source;
  for (const auto& [mnemonic, _] : instructions)
    source += " " + mnemonic + " 0x123\n";

  const CodeMemory image = Assembler().assemble(source);
  CHECK(image.byteCount() == instructions.size() * 3);
  for (std::size_t i = 0; i < instructions.size(); ++i) {
    const std::size_t address = i * 3;
    const int opcode = instructions[i].second;
    const int displacement = 0x123 - static_cast<int>(address + 3);
    const int flags_and_displacement_high = 0x20 | ((displacement >> 8) & 0x0F);
    const int displacement_low = displacement & 0xFF;
    CHECK(bytesAt(image, address, 3) ==
          (Bytes{opcode + 3, flags_and_displacement_high, displacement_low}));
  }
}

TEST(simulator_halt_extension) {
  Assembler assembler;
  const CodeMemory image = assembler.assemble(
      "PROGRAM START 0x100\n"
      "ENTRY  HALT\n"
      "       END ENTRY\n");

  CHECK(bytesAt(image, 0x100, 1) == (Bytes{0xFC}));
  CHECK(assembler.lastInfo().entryPoint == 0x100);
}

TEST(base_relative_and_direct) {
  const char* src =
      " START 0\n"
      " LDB #BUF\n"             // PC-rel impossible, BASE not yet active -> direct 0xBC1
      " BASE BUF\n"
      " LDA FAR\n"              // pc disp 3053 too big; base disp 50 -> b=1
      " RSUB\n"
      " RESB 3000\n"
      "BUF RESB 50\n"
      "FAR RESB 1\n"
      " END\n";
  CodeMemory m = Assembler().assemble(src);
  CHECK(bytesAt(m, 0, 3) == (Bytes{0x69, 0x0B, 0xC1}));
  CHECK(bytesAt(m, 3, 3) == (Bytes{0x03, 0x40, 0x32}));
  CHECK(m.byteCount() == 9);   // RESB emits nothing: memory stays sparse
}

TEST(pc_relative_boundaries) {
  // Placed above 0x1000 so the direct-addressing fallback is impossible and
  // only PC-relative can succeed. Displacements +2047 / -2048 are legal; one
  // further in either direction must be rejected with a format-4 hint.
  auto fwd = [](int gap) {
    return " START 0x2000\n LDA TGT\n RESB " + std::to_string(gap) + "\nTGT RESB 1\n";
  };
  auto bwd = [](int gap) {
    return " START 0x2000\nTGT RESB " + std::to_string(gap) + "\n LDA TGT\n";
  };
  CHECK(errorsOf(fwd(2047)).empty());
  CHECK(hasError(fwd(2048), "format 4"));
  CHECK(errorsOf(bwd(2045)).empty());          // next PC - TGT = 2048
  CHECK(hasError(bwd(2046), "format 4"));
  // ...and when the target fits in 12 bits, the direct fallback kicks in instead.
  CHECK(errorsOf(" START 0\n LDA TGT\n RESB 2048\nTGT RESB 1\n").empty());
}

TEST(format4_and_immediate) {
  CodeMemory m = Assembler().assemble(" +LDA #4096\n +LDA BIG,X\nBIG EQU 0x12345\n");
  CHECK(bytesAt(m, 0, 4) == (Bytes{0x01, 0x10, 0x10, 0x00}));
  CHECK(bytesAt(m, 4, 4) == (Bytes{0x03, 0x91, 0x23, 0x45}));
  CHECK(hasError(" LDA #4096\n", "12 bits"));
  CHECK(hasError(" +LDA #0x100000\n", "out of range"));
}

TEST(indirect_and_indexed_rules) {
  CodeMemory m = Assembler().assemble(" STCH BUF,X\n J @PTR\nBUF RESB 1\nPTR RESB 3\n");
  CHECK(bytesAt(m, 0, 3) == (Bytes{0x57, 0xA0, 0x03}));   // n=i=1, x=1, p=1, disp 6-3
  CHECK(bytesAt(m, 3, 3) == (Bytes{0x3E, 0x20, 0x01}));   // n=1 i=0, p=1, disp 1
  CHECK(hasError(" LDA #5,X\n", "Indexed addressing is only valid"));
  CHECK(hasError(" LDA @5,X\n", "Indexed addressing is only valid"));
  CHECK(hasError(" LDA 5,Y\n", "Only register X"));
}

TEST(data_directives_and_expressions) {
  CodeMemory m = Assembler().assemble(
      " START 0x100\nBEG BYTE C'EOF'\n BYTE X'F1',255,-1\n WORD -1\n WORD FIN-BEG\nFIN EQU *\n");
  CHECK(bytesAt(m, 0x100, 3) == (Bytes{0x45, 0x4F, 0x46}));
  CHECK(bytesAt(m, 0x103, 3) == (Bytes{0xF1, 0xFF, 0xFF}));
  CHECK(bytesAt(m, 0x106, 3) == (Bytes{0xFF, 0xFF, 0xFF}));
  CHECK(bytesAt(m, 0x109, 3) == (Bytes{0x00, 0x00, 0x0C}));   // FIN-BEG is absolute = 12
  CHECK(hasError(" BYTE 256\n", "8 bits"));
  CHECK(hasError(" BYTE X'F'\n", "even number"));
  CHECK(hasError(" WORD 0x1000000\n", "24 bits"));
}

TEST(case_insensitive_ok) {
  Assembler a;
  CodeMemory m = a.assemble(". header\nstart 0\n   lda #1   ; one\nHere  Lda here\n  end\n");
  CHECK(bytesAt(m, 0, 3) == (Bytes{0x01, 0x00, 0x01}));
  CHECK(bytesAt(m, 3, 3) == (Bytes{0x03, 0x2F, 0xFD}));       // HERE-6 = -3 -> 0xFFD
}

TEST(org_creates_second_segment) {
  CodeMemory m = Assembler().assemble(" START 0\n RSUB\n ORG 0x1000\n RSUB\n ORG\n RSUB\n");
  CHECK(m.segments().size() == 2);                              // 0..5 and 0x1000..0x1002
  CHECK(bytesAt(m, 0, 6) == (Bytes{0x4F, 0, 0, 0x4F, 0, 0}));
  CHECK(bytesAt(m, 0x1000, 3) == (Bytes{0x4F, 0, 0}));
  CHECK(m.read(0x1000).has_value());
}

TEST(start_end_and_reservations_produce_loadable_sparse_image) {
  Assembler assembler;
  const CodeMemory image = assembler.assemble(
      "PROGRAM START 0x100\n"
      "ENTRY  LDA #7\n"
      "       RESB 2\n"
      "       ORG 0x200\n"
      "STOP   HALT\n"
      "       END STOP\n");

  CHECK(image.segments().size() == 2);
  CHECK(bytesAt(image, 0x100, 3) == (Bytes{0x01, 0x00, 0x07}));
  CHECK(!image.read(0x103).has_value());
  CHECK(bytesAt(image, 0x200, 1) == (Bytes{0xFC}));
  CHECK(assembler.lastInfo().startAddress == 0x100);
  CHECK(assembler.lastInfo().entryPoint == 0x200);
  CHECK(assembler.lastInfo().length == 0x101);
}

TEST(sic_mode) {
  AssemblerOptions o; o.mode = ArchMode::Sic;
  CodeMemory m = Assembler(o).assemble(" START 0\n LDA VAL,X\n RSUB\nVAL WORD 1\n");
  CHECK(bytesAt(m, 0, 3) == (Bytes{0x00, 0x80, 0x06}));
  CHECK(bytesAt(m, 3, 3) == (Bytes{0x4C, 0x00, 0x00}));
  CHECK(hasError(" LDA #5\n", "not available in SIC mode", o));
  CHECK(hasError(" +LDA 5\n", "Format 4", o));
  CHECK(hasError(" LDB 5\n", "not available in SIC mode", o));
  CHECK(hasError(" CLEAR X\n", "not available in SIC mode", o));
}

TEST(diagnostics_reject_invalid_mnemonics_and_operands) {
  CHECK(hasError(" FIX A\n", "takes no operands"));
  CHECK(hasError("LBL FOO 1\n", "Unknown mnemonic"));
  CHECK(hasError(" LDA\n", "Missing operand"));
  CHECK(hasError(" LDA 1,X,Y\n", "Too many operands"));
  CHECK(hasError(" LDA 1+\n", "Expected an operand"));
}

TEST(diagnostics_validate_registers_and_format_rules) {
  CHECK(hasError(" SHIFTL A,17\n", "Shift count"));
  CHECK(hasError(" SHIFTL A,0\n", "Shift count"));
  CHECK(hasError(" SVC 16\n", "Service number"));
  CHECK(hasError(" CLEAR Q\n", "Unknown register"));
  CHECK(hasError("X RSUB\n", "register name"));
  CHECK(hasError(" +RSUB\n", "cannot use format 4"));
  CHECK(hasError(" +BYTE 1\n", "only be applied to instructions"));
}

TEST(diagnostics_report_symbol_and_directive_errors) {
  CHECK(hasError(" LDA NOWHERE\n", "Undefined symbol"));
  CHECK(hasError("A1 RSUB\nA1 RSUB\n", "Duplicate symbol"));
  CHECK(hasError("SUB RSUB\n", "Undefined symbol"));              // SUB is a mnemonic, not a label
  CHECK(hasError(" RESB A\nA RSUB\n", "must be defined before"));
  CHECK(hasError(" START 0\n RSUB\n START 0\n", "first statement"));
  CHECK(hasError(" RESB 1/0\n", "Division by zero"));
  CHECK(hasError(" ORG\n", "no previous location"));
  CHECK(hasError("EQ EQU\n", "Missing operand"));
  CHECK(hasError(" EQU 5\n", "requires a label"));
  CHECK(hasError(" START 0\n ORG 0\n RSUB\n ORG 0\n RSUB\n", "overlaps"));
  CHECK(hasError(" START 0xFFFFE\n RESB 10\n", "address space"));
}

TEST(errors_throw_and_carry_diagnostics) {
  Assembler a;
  bool threw = false;
  try { a.assemble(" LDA NOPE\n FOO\n"); }
  catch (const AssemblyError& e) { threw = true; CHECK(e.diagnostics().size() >= 2); }
  CHECK(threw);
  CHECK(!a.lastInfo().diagnostics.empty());
}

TEST(entry_listing_and_warnings) {
  Assembler a;
  a.assemble("PROG START 0x10\n NOP1 RSUB\nGO RSUB\n END GO\n");  // NOP1 is a label here
  CHECK(a.lastInfo().programName == "PROG");
  CHECK(a.lastInfo().entryPoint == 0x13);
  CHECK(a.lastInfo().startAddress == 0x10 && a.lastInfo().length == 6);
  CHECK(a.lastInfo().symbols.at("GO") == 0x13);
  CHECK(a.lastInfo().listing.find("0013") != std::string::npos);
  auto r = Assembler().assembleDetailed(" RSUB\n");
  CHECK(r.ok() && r.info.diagnostics.size() == 1);               // "Missing END" warning
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
