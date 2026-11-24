// Dependency-free test runner for the linker pipeline: object program text, linker and
// relocating loader (same pattern as test_load.cpp). Links only the static assembler.
#include <cstdio>
#include <cstdint>
#include <string>
#include <vector>

#include <fstream>
#include <set>
#include <sstream>

#include "assembler/assembler.hpp"
#include "assembler/linker.hpp"
#include "assembler/object_program.hpp"
#include "assembler/object_text.hpp"

using namespace sicxe;

static int g_failures = 0, g_checks = 0;
#define CHECK(cond)                                                              \
  do {                                                                           \
    ++g_checks;                                                                  \
    if (!(cond)) { ++g_failures; std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)

#define TEST(name) static void name(); static Registrar r_##name(#name, name); static void name()
struct Registrar { Registrar(const char* n, void (*f)()); };
static std::vector<std::pair<const char*, void (*)()>>& registry() { static std::vector<std::pair<const char*, void (*)()>> r; return r; }
Registrar::Registrar(const char* n, void (*f)()) { registry().push_back({n, f}); }

static std::vector<std::string> linesOf(const std::string& text) {
  std::vector<std::string> out;
  std::string line;
  for (char c : text) {
    if (c == '\n') { out.push_back(line); line.clear(); }
    else line += c;
  }
  if (!line.empty()) out.push_back(line);
  return out;
}

static bool hasLine(const std::vector<std::string>& lines, const std::string& wanted) {
  for (const auto& l : lines) if (l == wanted) return true;
  std::printf("  (no line '%s')\n", wanted.c_str());
  return false;
}

static bool hasLineStartingWith(const std::vector<std::string>& lines, const std::string& prefix) {
  for (const auto& l : lines) if (l.compare(0, prefix.size(), prefix) == 0) return true;
  std::printf("  (no line starting '%s')\n", prefix.c_str());
  return false;
}

static ObjectProgram oneSection() {
  ControlSection s;
  s.name = "PROG";
  s.length = 0x1E;
  s.defines = {{"N", 0x18}};
  s.refers = {"DOBRA"};
  s.text.push_back({0, {0x4B, 0x10, 0x00, 0x00}});
  s.notes.push_back({0, 4, 3, "+JSUB DOBRA"});
  s.mods.push_back({1, 5, '+', "DOBRA", 3});
  s.transfer = 0;
  s.sourceFile = "main.asm";
  ObjectProgram p;
  p.sections.push_back(s);
  return p;
}

// ---------------------------------------------------------------------------
TEST(render_records_and_annotations) {
  const RenderedText r = renderObjectText(oneSection());
  const auto lines = linesOf(r.text);
  CHECK(hasLine(lines, "H PROG   000000 00001E"));
  CHECK(hasLine(lines, "D N      000018"));
  CHECK(hasLine(lines, "R DOBRA"));
  CHECK(hasLine(lines, "T 000000 04 4B100000"));
  bool annotated = false;
  for (const auto& l : lines)
    if (l.compare(0, 3, "  .") == 0 && l.find("000000") != std::string::npos &&
        l.find("4B100000") != std::string::npos && l.find("+JSUB DOBRA") != std::string::npos)
      annotated = true;
  CHECK(annotated);
  CHECK(hasLineStartingWith(lines, "M 000001 05 +DOBRA"));
  CHECK(hasLineStartingWith(lines, "E 000000"));

  const std::vector<std::string> expected = {"HPROG  00000000001E", "DN     000018", "RDOBRA",
                                             "T000000044B100000", "M00000105+DOBRA", "E000000"};
  CHECK(beckRecords(r.text) == expected);
}

TEST(render_bands_follow_origins) {
  ControlSection s;
  s.name = "PROG";
  s.length = 0x20;
  s.text.push_back({0x00, {0x4B, 0x10, 0x00, 0x00}});
  s.notes.push_back({0x00, 4, 1, "+JSUB DOBRA"});
  s.text.push_back({0x10, {0x01, 0x00, 0x2A}});
  s.notes.push_back({0x10, 3, 2, "LDA #42"});
  ObjectProgram p;
  p.sections.push_back(s);
  const std::vector<OriginRange> origins = {{0x00, 0x10, "main.asm", "PROG"},
                                            {0x10, 0x10, "dobra.asm", "DOBRA"}};
  const RenderedText r = renderObjectText(p, origins);
  const auto lines = linesOf(r.text);
  CHECK(r.bands.size() == 2);
  if (r.bands.size() != 2) return;
  CHECK(r.bands[0].label == "main.asm \xC2\xB7 PROG");
  CHECK(r.bands[1].label == "dobra.asm \xC2\xB7 DOBRA");
  CHECK(r.bands[0].lastLine < r.bands[1].firstLine);
  CHECK(lines[r.bands[0].firstLine - 1].compare(0, 8, "T 000000") == 0);
  CHECK(lines[r.bands[1].firstLine - 1].compare(0, 8, "T 000010") == 0);
  CHECK(lines[r.bands[0].lastLine - 1].compare(0, 3, "  .") == 0);  // annotation lines belong to the band
}

TEST(render_section_without_transfer) {
  ObjectProgram p = oneSection();
  p.sections[0].transfer.reset();
  const auto lines = linesOf(renderObjectText(p).text);
  CHECK(hasLine(lines, "E"));
}

// ---------------------------------------------------------------------------
// The linker (Beck 3.2.3 and 3.4.1): two passes over control sections, relative to 0.
static std::string readData(const std::string& name) {
  std::ifstream in(std::string(SICXE_TEST_DATA) + "/" + name, std::ios::binary);
  std::ostringstream text;
  text << in.rdbuf();
  return text.str();
}

static LinkInput load(const std::string& file, const std::string& source, AssemblerOptions options = {}) {
  AssemblyResult r = Assembler(options).assembleDetailed(source);
  for (const auto& d : r.info.diagnostics)
    if (d.severity == Severity::Error) std::printf("  (%s: %s)\n", file.c_str(), d.toString().c_str());
  for (auto& section : r.object.sections) section.sourceFile = file;
  return {file, std::move(r.object)};
}

static std::vector<LinkInput> fig38() {
  std::vector<LinkInput> inputs;
  for (const char* name : {"beck_fig3_8_proga.asm", "beck_fig3_8_progb.asm", "beck_fig3_8_progc.asm"})
    inputs.push_back(load(name, readData(name)));
  return inputs;
}

static bool hasDiag(const LinkResult& r, const std::string& file, int line, const std::string& needle) {
  for (const auto& d : r.diagnostics)
    if (d.file == file && d.diagnostic.line == line && d.diagnostic.message.find(needle) != std::string::npos) return true;
  for (const auto& d : r.diagnostics) std::printf("  (%s:%d %s)\n", d.file.c_str(), d.diagnostic.line, d.diagnostic.message.c_str());
  return false;
}

static std::vector<std::uint8_t> linkedBytes(const ObjectProgram& program, std::size_t address, std::size_t count) {
  std::vector<std::uint8_t> out;
  for (std::size_t i = 0; i < count; ++i)
    for (const auto& run : program.sections[0].text)
      if (address + i >= run.address && address + i < run.address + run.bytes.size())
        out.push_back(run.bytes[address + i - run.address]);
  return out;
}

TEST(beck_fig3_8_link) {
  std::vector<std::string> want;
  std::istringstream expected(readData("beck_fig3_9.txt"));
  for (std::string line; std::getline(expected, line);) {
    if (!line.empty() && line.back() == '\r') line.pop_back();  // a CRLF checkout
    want.push_back(line);
  }
  const std::vector<LinkInput> inputs = fig38();
  std::vector<std::string> got;
  for (const auto& input : inputs)
    for (const auto& record : beckRecords(renderObjectText(input.object).text)) got.push_back(record);
  CHECK(got.size() == want.size());
  for (std::size_t i = 0; i < std::min(got.size(), want.size()); ++i) {
    if (got[i] != want[i]) std::printf("  record %zu\n   got  %s\n   want %s\n", i + 1, got[i].c_str(), want[i].c_str());
    CHECK(got[i] == want[i]);
  }

  const LinkResult r = link(inputs);
  CHECK(r.ok());
  struct Row { const char* section; const char* symbol; std::size_t address, length; };
  const std::vector<Row> rows = {{"PROGA", "", 0x000, 0x63}, {"PROGA", "LISTA", 0x040, 0}, {"PROGA", "ENDA", 0x054, 0},
                                 {"PROGB", "", 0x063, 0x7F}, {"PROGB", "LISTB", 0x0C3, 0}, {"PROGB", "ENDB", 0x0D3, 0},
                                 {"PROGC", "", 0x0E2, 0x51}, {"PROGC", "LISTC", 0x112, 0}, {"PROGC", "ENDC", 0x124, 0}};
  CHECK(r.estab.size() == rows.size());
  for (std::size_t i = 0; i < std::min(rows.size(), r.estab.size()); ++i) {
    const auto& e = r.estab[i];
    if (e.section != rows[i].section || e.symbol != rows[i].symbol || e.address != rows[i].address || e.length != rows[i].length)
      std::printf("  estab row %zu: %s %s %zX %zX\n", i, e.section.c_str(), e.symbol.c_str(), e.address, e.length);
    CHECK(e.section == rows[i].section && e.symbol == rows[i].symbol && e.address == rows[i].address && e.length == rows[i].length);
  }
  CHECK(r.estab.size() == 9 && r.estab[0].sourceFile == "beck_fig3_8_proga.asm" && r.estab[7].sourceFile == "beck_fig3_8_progc.asm");

  CHECK(r.linked.sections.size() == 1);
  if (r.linked.sections.size() != 1) return;
  const ControlSection& out = r.linked.sections[0];
  CHECK(out.name == "PROGA" && out.start == 0 && out.length == 0x133);
  CHECK(out.transfer && *out.transfer == 0x20);
  // Only the fields that are relative to the program start remain, each as +PROGA.
  const std::vector<std::size_t> relative = {0x24, 0x54, 0x5A, 0x9A, 0xD3, 0xD9, 0xFB, 0xFF, 0x124, 0x12A};
  CHECK(out.mods.size() == relative.size());
  for (std::size_t i = 0; i < std::min(relative.size(), out.mods.size()); ++i)
    CHECK(out.mods[i].address == relative[i] && out.mods[i].sign == '+' && out.mods[i].symbol == "PROGA");
  CHECK((linkedBytes(r.linked, 0x23, 4) == std::vector<std::uint8_t>{0x77, 0x10, 0x00, 0xC7}));  // LISTB+4 = 0xC3+4
  CHECK((linkedBytes(r.linked, 0x57, 3) == std::vector<std::uint8_t>{0x00, 0x00, 0x08}));        // ENDC-LISTC-10
  CHECK((linkedBytes(r.linked, 0x60, 3) == std::vector<std::uint8_t>{0x00, 0x00, 0x83}));        // LISTB-LISTA
  CHECK(r.origins.size() == 3 && r.origins[1].start == 0x63 && r.origins[1].sourceFile == "beck_fig3_8_progb.asm");
}

TEST(pass2_trace_shows_before_after) {
  const LinkResult r = link(fig38());
  std::size_t one = 0, two = 0;
  const LinkStep* ref2 = nullptr;
  for (const auto& step : r.trace) {
    if (step.pass == LinkStep::Pass::One) ++one;
    else ++two;
    if (step.pass == LinkStep::Pass::Two && step.address == 0x24 && step.symbol == "LISTB") ref2 = &step;
  }
  CHECK(one == 9);   // one per ESTAB row
  CHECK(two == 40);  // one per M record of the three object programs
  CHECK(ref2 != nullptr);
  if (!ref2) return;
  CHECK(ref2->before == 0x4 && ref2->after == 0xC7 && ref2->file == "beck_fig3_8_proga.asm" && ref2->line == 9);
}

TEST(net_relocation_cancels) {
  const LinkResult r = link({load("a.asm", "MAIN ENTRY 0\n EXTREF BUFFER,BUFEND\n WORD BUFEND-BUFFER\n WORD BUFFER\n END\n"),
                             load("b.asm", "DATA START 0\n EXTDEF BUFFER,BUFEND\nBUFFER RESB 4\nBUFEND EQU *\n END\n")});
  CHECK(r.ok());
  if (r.linked.sections.size() != 1) { CHECK(false); return; }
  CHECK((linkedBytes(r.linked, 0, 6) == std::vector<std::uint8_t>{0, 0, 4, 0, 0, 6}));
  CHECK(r.linked.sections[0].mods.size() == 1 && r.linked.sections[0].mods[0].address == 3);
}

TEST(net_relocation_invalid) {
  const LinkResult r = link({load("a.asm", "MAIN ENTRY 0\n EXTREF BUFFER,BUFEND\n WORD BUFFER+BUFEND\n END\n"),
                             load("b.asm", "DATA START 0\n EXTDEF BUFFER,BUFEND\nBUFFER RESB 4\nBUFEND EQU *\n END\n")});
  CHECK(!r.ok());
  CHECK(hasDiag(r, "a.asm", 3, "relocation of this field is not 0 or 1"));
}

TEST(entry_count) {
  const std::string main = "MAIN START 0\n RSUB\n END\n";
  const std::string sub = "SUBB START 0\n RSUB\n END\n";
  CHECK(hasDiag(link({load("a.asm", main), load("b.asm", sub)}), "a.asm", 1, "no ENTRY in the linked files"));
  CHECK(hasDiag(link({load("a.asm", "MAIN ENTRY 0\n RSUB\n END\n"), load("b.asm", "SUBB ENTRY 0\n RSUB\n END\n")}),
                "b.asm", 1, "a second ENTRY"));
  CHECK(link({load("a.asm", main)}).ok());
  CHECK(link({load("a.asm", "MAIN ENTRY 0\n RSUB\n END\n")}).ok());
}

TEST(end_operand_outside_entry) {
  const LinkResult r = link({load("a.asm", "MAIN ENTRY 0\n RSUB\n END MAIN\n"),
                             load("b.asm", "SUBB START 0\nGO RSUB\n END GO\n")});
  CHECK(hasDiag(r, "b.asm", 3, "only the ENTRY file can name a transfer address"));
}

TEST(duplicate_external) {
  const LinkResult r = link({load("a.asm", "MAIN ENTRY 0\n EXTDEF HI\nHI RSUB\n END\n"),
                             load("b.asm", "SUBB START 0\n EXTDEF HI\nHI RSUB\n END\n")});
  CHECK(!r.ok());
  CHECK(hasDiag(r, "a.asm", 1, "HI is defined twice"));
  CHECK(hasDiag(r, "b.asm", 1, "HI is defined twice"));
}

TEST(undefined_external) {
  const LinkResult r = link({load("a.asm", "MAIN ENTRY 0\n EXTREF NOWHERE\n +JSUB NOWHERE\n END\n")});
  CHECK(!r.ok());
  CHECK(hasDiag(r, "a.asm", 3, "undefined external symbol NOWHERE"));
}

TEST(nonzero_start_multifile) {
  const LinkResult r = link({load("a.asm", "MAIN ENTRY 0\n RSUB\n END\n"), load("b.asm", "SUBB START 100\n RSUB\n END\n")});
  CHECK(hasDiag(r, "b.asm", 1, "START must be 0 when files are linked"));
  CHECK(link({load("a.asm", "ABS START 0x1000\n RSUB\n END\n")}).ok());  // one absolute file links as it is
}

TEST(fixed_field_at_nonzero_csaddr) {
  const std::string direct = "SUBB START 0\nV WORD 1\n RESB 4096\n LDA V\n END\n";
  CHECK(hasDiag(link({load("a.asm", "MAIN ENTRY 0\n RSUB\n END\n"), load("b.asm", direct)}), "b.asm", 4, "cannot be relocated"));
  CHECK(link({load("b.asm", direct)}).ok());  // at address 0 the field is already right
}

TEST(sic_files_cannot_link) {
  AssemblerOptions sic;
  sic.mode = ArchMode::Sic;
  const LinkResult r = link({load("a.asm", "MAIN ENTRY 0\n RSUB\n END\n", sic),
                             load("b.asm", "SUBB START 0\n LDA V\nV WORD 1\n END\n", sic)});
  CHECK(hasDiag(r, "b.asm", 2, "cannot be relocated"));
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
