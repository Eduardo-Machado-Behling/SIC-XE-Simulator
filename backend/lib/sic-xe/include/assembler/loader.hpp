#pragma once
// The relocating loader (Beck 3.2.1): puts the linked program at the load address (PROGADDR)
// by adding it to every field that is relative to the start of the program, and writes the
// result as an image ready for memory.

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include "assembler/linker.hpp"
#include "memory/CodeMemory.hpp"

namespace sicxe {

// Where an emitted instruction came from, in the addresses of the loaded program.
struct LinkedSourceLocation {
  std::size_t address = 0;
  std::size_t size = 0;
  std::string file;
  int line = 0;  // a line of the file's own assembly text (MASMAPRG.ASM when it has macros)
};

// One relocated field: its address in memory and its value before and after.
struct LoadStep {
  std::size_t address = 0;
  std::int64_t before = 0, after = 0;
};

struct LoadResult {
  CodeMemory memory;            // empty when there are errors
  std::size_t entryPoint = 0;   // where PC starts
  std::vector<LinkedSourceLocation> sourceMap;
  std::vector<LoadStep> trace;  // empty when the load address is 0: nothing moves
  std::vector<FileDiagnostic> diagnostics;

  bool ok() const {
    for (const auto& d : diagnostics)
      if (d.diagnostic.severity == Severity::Error) return false;
    return true;
  }
};

// A program assembled with a nonzero START is absolute: it loads where it says, and only
// load address 0 is accepted. The whole length must fit in `memorySize` bytes.
LoadResult relocateAndLoad(const LinkResult& linked, std::size_t loadAddress, std::size_t memorySize);

}  // namespace sicxe
