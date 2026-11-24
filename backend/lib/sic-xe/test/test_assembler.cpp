// Dependency-free test runner (swap for GoogleTest/Catch2 in a real project).
// Expected bytes below were derived by hand from Beck's encoding rules.
#include <cstdio>
#include <algorithm>
#include <functional>
#include <string>
#include <vector>

#include "assembler/assembler.hpp"
#include "assembler/object_text.hpp"
#include <fstream>
#include <sstream>
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
      "      STA   VAL,$X\n"    // 0006: 0F A0 07   (16 - 9)
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
      " CLEAR $X\n COMP $A,$S\n SHIFTL $A,4\n SHIFTR $T,16\n SVC 3\n TIX $T\n FIX\n");
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
      " ADD $A,$S\n"
      " CLEAR $F\n"
      " COMP $T,$PC\n"
      " DIV $S,$T\n"
      " MUL $L,$F\n"
      " RMO $SW,$A\n"
      " SHIFTL $A,1\n"
      " SHIFTR $F,16\n"
      " SUB $X,$B\n"
      " SVC 15\n"
      " TIX $L\n");

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
      "BEGIN  HALT\n"
      "       END BEGIN\n");

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
  CodeMemory m = Assembler().assemble(" +LDA #4096\n +LDA BIG,$X\nBIG EQU 0x12345\n");
  CHECK(bytesAt(m, 0, 4) == (Bytes{0x01, 0x10, 0x10, 0x00}));
  CHECK(bytesAt(m, 4, 4) == (Bytes{0x03, 0x91, 0x23, 0x45}));
  CHECK(hasError(" LDA #4096\n", "12 bits"));
  CHECK(hasError(" +LDA #0x100000\n", "out of range"));
}

TEST(indirect_and_indexed_rules) {
  CodeMemory m = Assembler().assemble(" STCH BUF,$X\n J @PTR\nBUF RESB 1\nPTR RESB 3\n");
  CHECK(bytesAt(m, 0, 3) == (Bytes{0x57, 0xA0, 0x03}));   // n=i=1, x=1, p=1, disp 6-3
  CHECK(bytesAt(m, 3, 3) == (Bytes{0x3E, 0x20, 0x01}));   // n=1 i=0, p=1, disp 1
  CHECK(hasError(" LDA #5,$X\n", "Indexed addressing is only valid"));
  CHECK(hasError(" LDA @5,$X\n", "Indexed addressing is only valid"));
  CHECK(hasError(" LDA 5,$A\n", "Only $X"));
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
      "BEGIN  LDA #7\n"
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
  CodeMemory m = Assembler(o).assemble(" START 0\n LDA VAL,$X\n RSUB\nVAL WORD 1\n");
  CHECK(bytesAt(m, 0, 3) == (Bytes{0x00, 0x80, 0x06}));
  CHECK(bytesAt(m, 3, 3) == (Bytes{0x4C, 0x00, 0x00}));
  CHECK(hasError(" LDA #5\n", "not available in SIC mode", o));
  CHECK(hasError(" +LDA 5\n", "Format 4", o));
  CHECK(hasError(" LDB 5\n", "not available in SIC mode", o));
  CHECK(hasError(" CLEAR $X\n", "not available in SIC mode", o));
}

TEST(diagnostics_reject_invalid_mnemonics_and_operands) {
  CHECK(hasError(" FIX A\n", "takes no operands"));
  CHECK(hasError("LBL FOO 1\n", "Unknown mnemonic"));
  CHECK(hasError(" LDA\n", "Missing operand"));
  CHECK(hasError(" LDA 1,$X,Y\n", "Too many operands"));
  CHECK(hasError(" LDA 1+\n", "Expected an operand"));
}

TEST(diagnostics_validate_registers_and_format_rules) {
  CHECK(hasError(" SHIFTL $A,17\n", "Shift count"));
  CHECK(hasError(" SHIFTL $A,0\n", "Shift count"));
  CHECK(hasError(" SVC 16\n", "Service number"));
  CHECK(hasError(" CLEAR X\n", "must start with '$'"));
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

TEST(analysis_reports_symbol_definition_and_reference_locations) {
  const auto result = Assembler().assembleDetailed(
      "MAIN START 0\n"
      "LOOP LDA VALUE\n"
      "VALUE WORD LOOP\n"
      " END LOOP\n");

  const auto loop = std::find_if(result.info.symbolDefinitions.begin(), result.info.symbolDefinitions.end(),
                                 [](const SymbolLocation& symbol) { return symbol.name == "LOOP"; });
  const auto value = std::find_if(result.info.symbolDefinitions.begin(), result.info.symbolDefinitions.end(),
                                  [](const SymbolLocation& symbol) { return symbol.name == "VALUE"; });
  CHECK(loop != result.info.symbolDefinitions.end());
  CHECK(value != result.info.symbolDefinitions.end());
  if (loop != result.info.symbolDefinitions.end()) {
    CHECK(loop->line == 2 && loop->column == 1 && loop->length == 4);
    CHECK(loop->value == 0);
  }
  if (value != result.info.symbolDefinitions.end()) {
    CHECK(value->line == 3 && value->column == 1 && value->length == 5);
    CHECK(value->value == 3);
  }

  const auto valueReference = std::find_if(result.info.symbolReferences.begin(), result.info.symbolReferences.end(),
                                           [](const SymbolReference& reference) { return reference.name == "VALUE"; });
  CHECK(valueReference != result.info.symbolReferences.end());
  if (valueReference != result.info.symbolReferences.end())
    CHECK(valueReference->line == 2 && valueReference->column == 10 && valueReference->length == 5);
  CHECK(std::count_if(result.info.symbolReferences.begin(), result.info.symbolReferences.end(),
                      [](const SymbolReference& reference) { return reference.name == "LOOP"; }) == 2);
}

// ---------------------------------------------------------------------------
// Control sections (Beck 2.3.5): CSECT, ENTRY, one scope and location counter per section.
static bool hasWarning(const std::string& src, const std::string& needle) {
  for (auto& d : Assembler().assembleDetailed(src).info.diagnostics)
    if (d.severity == Severity::Warning && d.message.find(needle) != std::string::npos) return true;
  return false;
}

static bool sameBytes(const std::vector<std::uint8_t>& got, std::initializer_list<int> want) {
  return got.size() == want.size() && std::equal(got.begin(), got.end(), want.begin());
}

TEST(csect_starts_new_location_counter) {
  const auto r = Assembler().assembleDetailed("SECA START 0\n LDA #1\nSECB CSECT\n LDA #2\n END\n");
  CHECK(r.ok());
  CHECK(r.object.sections.size() == 2);
  if (r.object.sections.size() != 2) return;
  CHECK(r.object.sections[0].name == "SECA" && r.object.sections[1].name == "SECB");
  CHECK(r.object.sections[0].text.size() == 1 && r.object.sections[0].text[0].address == 0);
  CHECK(sameBytes(r.object.sections[0].text[0].bytes, {0x01, 0x00, 0x01}));
  CHECK(r.object.sections[1].text.size() == 1 && r.object.sections[1].text[0].address == 0);
  CHECK(sameBytes(r.object.sections[1].text[0].bytes, {0x01, 0x00, 0x02}));
  CHECK(r.object.sections[0].length == 3 && r.object.sections[1].length == 3);
}

TEST(same_local_name_in_two_sections) {
  const auto r = Assembler().assembleDetailed("SECA START 0\nVAL WORD 1\nSECB CSECT\nVAL WORD 2\n END\n");
  CHECK(r.ok());
  if (r.object.sections.size() != 2) { CHECK(false); return; }
  CHECK(r.object.sections[0].symbols.at("VAL") == 0);
  CHECK(r.object.sections[1].symbols.at("VAL") == 0);
}

TEST(section_symbol_not_visible_in_other_section) {
  CHECK(hasError("SECA START 0\nVAL WORD 1\nSECB CSECT\n LDA VAL\n END\n",
                 "is defined in section SECA; add it to EXTREF"));
}

TEST(entry_marks_section) {
  const auto r = Assembler().assembleDetailed("PROG ENTRY 0\n RSUB\nINICIO LDA #5\n RSUB\n END INICIO\n");
  CHECK(r.ok());
  if (r.object.sections.size() != 1) { CHECK(false); return; }
  const auto& s = r.object.sections[0];
  CHECK(s.name == "PROG" && s.entry && s.startLine == 1);
  CHECK(s.transfer && *s.transfer == 3);
  CHECK(s.endOperandLine == 5);
}

TEST(end_closes_file) {
  const std::string src = "SECA START 0\n RSUB\n END\nSECB CSECT\n RSUB\n";
  CHECK(Assembler().assembleDetailed(src).object.sections.size() == 1);
  CHECK(hasWarning(src, "CSECT after END is ignored"));
}

TEST(end_operand_resolves_in_first_section) {
  const auto r = Assembler().assembleDetailed("FIRST START 0\n RSUB\nGO RSUB\nSECB CSECT\n RSUB\n END GO\n");
  CHECK(r.ok());
  if (r.object.sections.size() != 2) { CHECK(false); return; }
  CHECK(r.object.sections[0].transfer && *r.object.sections[0].transfer == 3);
  CHECK(!r.object.sections[1].transfer);
}

TEST(nonzero_start_with_csect) {
  CHECK(hasError("SECA START 100\n RSUB\nSECB CSECT\n RSUB\n END\n", "START must be 0 when the file has control sections"));
}

TEST(directive_names_as_labels) {
  for (const char* name : {"ENTRY", "CSECT", "EXTDEF", "EXTREF"}) {
    const std::string src = std::string(name) + "   LDA #5\n END\n";
    CHECK(hasError(src, std::string(name) + " is a directive since stage 4; rename this label"));
  }
}

TEST(lowercase_section_directives) {
  const auto r = Assembler().assembleDetailed("seca start 0\n lda #1\nsecb csect\n lda #2\n end\n");
  CHECK(r.ok());
  if (r.object.sections.size() != 2) { CHECK(false); return; }
  CHECK(r.object.sections[0].name == "seca" && r.object.sections[1].name == "secb");
  CHECK(sameBytes(r.object.sections[1].text[0].bytes, {0x01, 0x00, 0x02}));
}

TEST(single_section_object_matches_info) {
  const auto r = Assembler().assembleDetailed("PROG START 0x10\n LDA #5\nV WORD 42\n END PROG\n");
  CHECK(r.ok());
  if (r.object.sections.size() != 1) { CHECK(false); return; }
  const auto& s = r.object.sections[0];
  CHECK(s.start == 0x10 && s.length == r.info.length);
  CHECK(s.text.size() == r.memory.segments().size());
  for (const auto& [address, bytes] : r.memory.segments()) {
    bool found = false;
    for (const auto& run : s.text)
      if (run.address == address && run.bytes.size() == bytes.size() &&
          std::equal(run.bytes.begin(), run.bytes.end(), bytes.begin()))
        found = true;
    CHECK(found);
  }
  CHECK(s.notes.size() == 2 && s.notes[0].text == "LDA #5" && s.notes[1].text == "WORD 42");
}

// ---------------------------------------------------------------------------
// External references (Beck 2.3.5): EXTDEF / EXTREF, D, R and revised M records.
static std::string readData(const char* name) {
  std::ifstream in(std::string(SICXE_TEST_DATA) + "/" + name, std::ios::binary);
  std::ostringstream text;
  text << in.rdbuf();
  return text.str();
}

TEST(beck_fig2_17_records) {
  const auto r = Assembler().assembleDetailed(readData("beck_fig2_15.asm"));
  for (const auto& d : r.info.diagnostics) std::printf("  (%s)\n", d.toString().c_str());
  CHECK(r.ok());
  const std::vector<std::string> got = beckRecords(renderObjectText(r.object).text);
  std::vector<std::string> want;
  std::istringstream expected(readData("beck_fig2_17.txt"));
  for (std::string line; std::getline(expected, line);) want.push_back(line);
  CHECK(got.size() == want.size());
  for (std::size_t i = 0; i < std::min(got.size(), want.size()); ++i) {
    if (got[i] != want[i]) std::printf("  record %zu\n   got  %s\n   want %s\n", i + 1, got[i].c_str(), want[i].c_str());
    CHECK(got[i] == want[i]);
  }
}

TEST(extref_in_format3_suggests_plus) {
  CHECK(hasError("SECA START 0\n EXTREF RDREC\n JSUB RDREC\n END\n",
                 "RDREC is an external reference; use +JSUB RDREC (format 4)"));
  CHECK(errorsOf("SECA START 0\n EXTREF RDREC\n +JSUB RDREC\n END\n").empty());
}

TEST(extdef_of_undefined_symbol) {
  CHECK(hasError("SECA START 0\n EXTDEF NOPE\n RSUB\n END\n", "EXTDEF names NOPE, which this section does not define"));
}

TEST(external_in_equ_base_and_products) {
  CHECK(hasError("SECA START 0\n EXTREF EXT\nLIM EQU EXT\n END\n", "external symbol"));
  CHECK(hasError("SECA START 0\n EXTREF EXT\n BASE EXT\n END\n", "external symbol"));
  CHECK(hasError("SECA START 0\n EXTREF EXT\n WORD EXT*2\n END\n", "external symbol"));
  CHECK(hasError("SECA START 0\n EXTREF EXT\n BYTE EXT\n END\n", "external symbol"));
}

TEST(extdef_absolute_equ) {
  const auto r = Assembler().assembleDetailed("SECA START 0\nK EQU 3\n EXTDEF K\n RSUB\n END\n");
  CHECK(r.ok());
  if (r.object.sections.size() != 1) { CHECK(false); return; }
  CHECK(r.object.sections[0].absoluteDefines == std::set<std::string>{"K"});
  CHECK(r.object.sections[0].defines.size() == 1 && r.object.sections[0].defines[0].second == 3);
}

TEST(external_terms_and_local_relocation_make_mods) {
  const auto r = Assembler().assembleDetailed(
      "SECA START 0\n EXTREF EXT,OTHER\nLOC RSUB\n WORD LOC\n WORD EXT-OTHER+4\n END\n");
  CHECK(r.ok());
  if (r.object.sections.size() != 1) { CHECK(false); return; }
  const auto& mods = r.object.sections[0].mods;
  CHECK(mods.size() == 3);
  if (mods.size() != 3) return;
  CHECK(mods[0].address == 3 && mods[0].halfBytes == 6 && mods[0].sign == '+' && mods[0].symbol == "SECA");
  CHECK(mods[1].address == 6 && mods[1].sign == '+' && mods[1].symbol == "EXT");
  CHECK(mods[2].address == 6 && mods[2].sign == '-' && mods[2].symbol == "OTHER");
  CHECK(sameBytes(r.object.sections[0].text[0].bytes, {0x4F, 0, 0, 0, 0, 0, 0, 0, 4}));
}

TEST(format3_direct_relocatable_is_fixed_field) {
  const auto r = Assembler().assembleDetailed("PROG START 0\nV WORD 1\n RESB 4096\n LDA V\n END\n");
  CHECK(r.ok());
  if (r.object.sections.size() != 1) { CHECK(false); return; }
  CHECK(r.object.sections[0].fixedFieldLines == std::vector<int>{4});

  AssemblerOptions sic;
  sic.mode = ArchMode::Sic;
  const auto s = Assembler(sic).assembleDetailed("PROG START 0\n LDA V\nV WORD 1\n END\n");
  CHECK(s.ok());
  if (s.object.sections.size() != 1) { CHECK(false); return; }
  CHECK(s.object.sections[0].fixedFieldLines == std::vector<int>{2});
}

TEST(sic_mode_rejects_sections) {
  AssemblerOptions sic;
  sic.mode = ArchMode::Sic;
  CHECK(hasError("SECA START 0\n RSUB\nSECB CSECT\n RSUB\n END\n", "control sections and external symbols need SIC/XE", sic));
  CHECK(hasError("SECA START 0\n EXTREF EXT\n RSUB\n END\n", "control sections and external symbols need SIC/XE", sic));
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
