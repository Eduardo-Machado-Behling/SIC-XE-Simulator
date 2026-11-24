// Dependency-free test runner for SICXE::load_file (same pattern as test_assembler.cpp).
// The project API only accepts JSON, so a source that is not UTF-8 can reach load_file
// only from here.
#include <cstdint>
#include <cstdio>
#include <exception>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "MacroReportJson.hpp"
#include "SICXE.hpp"
#include "DecodedInstruction.hpp"
#include "IInstruction.hpp"
#include "InstructionSet.hpp"
#include "InstructionTable.hpp"
#include "architecture/ExecutionContext.hpp"
#include "essentials/Word.hpp"
#include "architecture/events/EventManager.hpp"
#include "memory/Memory.hpp"
#include "memory/Registers.hpp"

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

// One SICXE wired like Simulator::load_project wires the architecture DLL.
struct Machine {
  Memory memory;
  Registers registers;
  architecture::events::EventManager events{memory, registers};
  MemoryAccessor memoryAccessor = memory.getAccessor(events);
  RegisterAccessor registerAccessor = registers.getAccessor(events);
  SICXE arch{memoryAccessor, registerAccessor, events};

  Machine() {
    memory.resize(arch.info().memory.address_space_size);
    for (const auto& r : arch.info().registers) registers.allocate(r.id, r.name, r.width);
  }
};

// Serializes like the WebSocket server: nlohmann's strict dump() throws on invalid UTF-8.
static bool dumps(const nlohmann::json& value) {
  try {
    (void)value.dump();
    return true;
  } catch (const nlohmann::json::exception& e) {
    std::printf("  (dump: %s)\n", e.what());
    return false;
  }
}

static bool contains(const std::string& text, const std::string& part) {
  return text.find(part) != std::string::npos;
}

static const std::string REPLACEMENT = "\xEF\xBF\xBD";  // U+FFFD

// ---------------------------------------------------------------------------
TEST(latin1_comment_still_reports_macros) {
  // "caf\xE9" is Latin-1: 0xE9 alone is not UTF-8. "caf\xC3\xA9" is UTF-8 and must survive.
  std::string source =
      "        MCDEFN\n"
      "        CARREGA X            ; caf\xE9\n"
      ". caf\xE9 no corpo\n"
      "        LDA X\n"
      "        MCEND\n"
      "PROG    START 0              ; caf\xC3\xA9\n"
      "        CARREGA VALOR        ; caf\xE9\n"
      "        HALT\n"
      "VALOR   WORD 5\n"
      "        END PROG\n";
  Machine m;
  bool loaded = true;
  try {
    m.arch.load_file(source);
  } catch (const std::exception& e) {
    loaded = false;
    std::printf("  (load: %s)\n", e.what());
  }
  CHECK(loaded);

  const nlohmann::json events = m.events.events_since(0);
  CHECK(dumps(events));
  const nlohmann::json* report = nullptr;
  for (const auto& event : events)
    if (event["type"] == "MacrosExpanded") report = &event["details"];
  CHECK(report != nullptr);
  if (report == nullptr) return;

  const std::string text = (*report)["text"].get<std::string>();
  CHECK(contains(text, ". caf" + REPLACEMENT + " no corpo"));
  CHECK(contains(text, "; caf\xC3\xA9"));
  CHECK(contains((*report)["expansions"][0]["callText"].get<std::string>(), "; caf" + REPLACEMENT));
  CHECK(contains((*report)["definitions"][0]["body"][1]["text"].get<std::string>(), "caf" + REPLACEMENT));
}

TEST(macro_report_replaces_invalid_utf8) {
  sicxe::MacroResult r;
  // Latin-1, valid 2- and 4-byte sequences, a UTF-16 surrogate (ED A0 80), a cut sequence.
  r.text = "a\xE9 b\xC3\xA9 c\xF0\x9F\x98\x80 d\xED\xA0\x80 e\xE2\x82";
  const nlohmann::json report = sicxe::macroReportJson(r);
  CHECK(dumps(report));
  const std::string R = REPLACEMENT;
  CHECK(report["text"] == "a" + R + " b\xC3\xA9 c\xF0\x9F\x98\x80 d" + R + R + R + " e" + R);
}

// One LDA per addressing mode: the word stored at the expected target address must reach A.
TEST(lda_addressing_modes) {
  struct Case {
    const char* name;
    std::uint32_t at;          // address of the instruction
    std::vector<byte_t> code;  // the LDA bytes
    std::uint32_t x, b;        // index and base registers
    std::uint32_t target;      // where the operand lives (0 for immediate)
  };
  const std::vector<Case> cases = {
      {"pc-relative, negative", 0x100, {0x03, 0x2F, 0xF0}, 0, 0, 0x0F3},  // 0x103 - 16
      {"base-relative", 0x000, {0x03, 0x40, 0x10}, 0, 0x2000, 0x2010},
      {"direct, indexed", 0x000, {0x03, 0x80, 0x20}, 5, 0, 0x025},
      {"format 4", 0x000, {0x03, 0x10, 0x12, 0x34}, 0, 0, 0x1234},
      {"indirect", 0x000, {0x02, 0x00, 0x40}, 0, 0, 0x300},              // word at 0x40 -> 0x300
      {"sic", 0x000, {0x00, 0x10, 0x30}, 0, 0, 0x1030},                  // 0x10 is address, not e
      {"sic, indexed", 0x000, {0x00, 0x90, 0x30}, 3, 0, 0x1033},
  };
  const std::vector<byte_t> value = {0x12, 0x34, 0x56};

  for (const auto& c : cases) {
    Machine m;
    m.memory.write(c.at, c.code);
    m.memory.write(c.target, value);
    if (c.target == 0x300) m.memory.write(0x40, {0x00, 0x03, 0x00});
    m.registerAccessor.write("PC", Word(c.at).to_bytes());
    m.registerAccessor.write("X", Word(c.x).to_bytes());
    m.registerAccessor.write("B", Word(c.b).to_bytes());
    m.arch.step();
    const std::uint32_t a = Word::from_bytes(m.registerAccessor.read("A")).as_unsigned();
    if (a != 0x123456) std::printf("  (%s: A = 0x%06X)\n", c.name, a);
    CHECK(a == 0x123456);
  }

  Machine m;  // immediate: the operand is the displacement itself
  m.memory.write(0, {0x01, 0x00, 0x2A});
  m.arch.step();
  CHECK(Word::from_bytes(m.registerAccessor.read("A")).as_unsigned() == 42);
}

// The table's `executable` column must match the CPU: every row the CPU binds runs, or
// throws "not implemented" exactly when the table says it is not executable.
TEST(instruction_table_matches_cpu) {
  Machine m;
  InstructionSet set;
  ExecutionContext context{m.registerAccessor, m.memoryAccessor};
  int bound = 0;
  for (const InstructionSpec& row : kInstructionTable) {
    const InstructionData* data = set.findByMnemonic(std::string(row.mnemonic));
    if (data == nullptr) {
      if (row.executable) std::printf("  (%s: executable but not bound)\n", std::string(row.mnemonic).c_str());
      CHECK(!row.executable);
      continue;
    }
    ++bound;
    CHECK(data->description.opcode == row.opcode);
    Operands operand = NoneOperand{};
    switch (row.operand_type) {
      case OperandType::Value:
        operand = hasFlag(row.flags, InstructionFlags::Floating) ? Operands{FloatOperand{}} : Operands{ValueOperand{}};
        break;
      case OperandType::Address: operand = AddressOperand{}; break;
      case OperandType::Register: operand = RegisterOperand{}; break;
      case OperandType::RegisterRegister: operand = RegistersOperand{}; break;
      case OperandType::RegisterImmediate: operand = RegisterValueOperand{}; break;
      case OperandType::None: break;
    }
    bool unimplemented = false;
    try {
      std::visit([&](auto&& value) { data->implementation->execute(context, value); }, operand);
    } catch (const UnimplementedInstruction&) {
      unimplemented = true;
    } catch (...) {
      // Any other failure (a division by zero, say) still means the body exists.
    }
    if (unimplemented == row.executable)
      std::printf("  (%s: table says executable=%d)\n", std::string(row.mnemonic).c_str(), row.executable);
    CHECK(unimplemented != row.executable);
  }
  CHECK(bound == 59);  // every row but SVC
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
