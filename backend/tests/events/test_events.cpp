// Dependency-free tests for the api-side simulator events, in the style of
// lib/sic-xe/test/test_assembler.cpp. Run one case: events_tests <case>.
#include <cstdio>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "architecture/events/EventManager.hpp"
#include "architecture/events/MemoryCleared.hpp"
#include "architecture/events/MemoryWrite.hpp"
#include "memory/Memory.hpp"
#include "memory/Registers.hpp"

using namespace architecture::events;
using Bytes = std::vector<byte_t>;

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

static Bytes bytesAt(const Memory& memory, std::size_t address, std::size_t size) {
  Bytes out;
  memory.read(address, size, out);
  return out;
}

// A 1 MB memory (the SIC/XE address space) holding a few bytes far apart:
// at the start, a program at 0x1000, a byte 0x40 past it, two bytes across
// the 4 KiB boundary at 0x3000, and the very last byte.
struct Fixture {
  static constexpr std::size_t kSize = 1 << 20;
  Memory memory;
  Registers registers;
  Fixture() {
    memory.resize(kSize);
    memory.write(0x0000, {0x11, 0x22});
    memory.write(0x1000, {0x01, 0x00, 0x05, 0x00, 0x00, 0x00, 0x01, 0x00, 0x07});
    memory.write(0x1049, {0x99});
    memory.write(0x2FFF, {0xAA, 0xBB});
    memory.write(kSize - 1, {0xFF});
    registers.allocate(1, "A", 3);
    registers.write("A", Bytes{0x00, 0x00, 0x05});
  }
  bool allZero() const {
    const Bytes all = bytesAt(memory, 0, kSize);
    for (const auto byte : all) if (byte != 0) return false;
    return true;
  }
  bool original() const {
    return bytesAt(memory, 0x0000, 3) == Bytes{0x11, 0x22, 0x00} &&
           bytesAt(memory, 0x1000, 9) == Bytes{0x01, 0x00, 0x05, 0x00, 0x00, 0x00, 0x01, 0x00, 0x07} &&
           bytesAt(memory, 0x1048, 3) == Bytes{0x00, 0x99, 0x00} &&
           bytesAt(memory, 0x2FFE, 4) == Bytes{0x00, 0xAA, 0xBB, 0x00} &&
           bytesAt(memory, kSize - 2, 2) == Bytes{0x00, 0xFF};
  }
};

// ---------------------------------------------------------------------------
TEST(memory_cleared_serializes_without_the_memory_contents) {
  const MemoryCleared event;
  CHECK(event.serialize() == nlohmann::json({{"type", "MemoryCleared"}}));
  CHECK(event.mutates());
}

TEST(memory_cleared_commit_zero_fills_and_restore_puts_the_bytes_back) {
  Fixture f;
  SimulatorEventState state(f.memory, f.registers);
  MemoryCleared event;

  event.commit(state);
  CHECK(f.allZero());
  CHECK(f.registers.read("A") == Bytes({0x00, 0x00, 0x05}));   // memory only

  event.restore(state);
  CHECK(f.original());
  CHECK(bytesAt(f.memory, 0x2000, 4) == Bytes({0, 0, 0, 0}));  // zeros stay zeros

  // A redo commits the same event again.
  event.commit(state);
  CHECK(f.allZero());
  event.restore(state);
  CHECK(f.original());
}

TEST(memory_cleared_on_an_empty_memory_does_nothing) {
  Memory memory;           // no project loaded: the memory was never sized
  Registers registers;
  SimulatorEventState state(memory, registers);
  MemoryCleared event;
  event.commit(state);
  event.restore(state);
  Bytes none;
  memory.read(0, 0, none);
  CHECK(none.empty());
}

TEST(event_manager_undoes_a_clear_and_the_writes_after_it) {
  Fixture f;
  EventManager manager(f.memory, f.registers);

  manager.execute(std::make_unique<MemoryCleared>());
  manager.execute(std::make_unique<architecture::events::MemoryWrite>(0x1000, Bytes{0xAB, 0xCD}, Bytes{0x00, 0x00}));
  CHECK(bytesAt(f.memory, 0x1000, 3) == Bytes({0xAB, 0xCD, 0x00}));
  CHECK(bytesAt(f.memory, 0x0000, 2) == Bytes({0x00, 0x00}));
  CHECK(manager.events_since(0) == nlohmann::json::array({
      {{"type", "MemoryCleared"}},
      {{"type", "MemoryWrite"}, {"address", 0x1000}, {"value", {0xAB, 0xCD}}, {"old_value", {0, 0}}},
  }));

  CHECK(manager.undo());   // the write
  CHECK(manager.undo());   // the clear
  CHECK(f.original());
  CHECK(!manager.can_undo());

  CHECK(manager.redo());
  CHECK(f.allZero());
  CHECK(manager.redo());
  CHECK(bytesAt(f.memory, 0x1000, 3) == Bytes({0xAB, 0xCD, 0x00}));
}

// ---------------------------------------------------------------------------
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
