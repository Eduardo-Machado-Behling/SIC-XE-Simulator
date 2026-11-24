// Dependency-free test runner for the linker pipeline: object program text, linker and
// relocating loader (same pattern as test_load.cpp). Links only the static assembler.
#include <cstdio>
#include <cstdint>
#include <string>
#include <vector>

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
