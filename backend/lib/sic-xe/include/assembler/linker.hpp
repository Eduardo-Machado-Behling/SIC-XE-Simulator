#pragma once
// The linker: Beck's linkage editor (3.4.1). Two passes over the control sections of the
// assembled files. Pass 1 places the sections one after another and builds the ESTAB;
// pass 2 resolves every modification record against it. The result is one relocatable
// program, relative to 0, that a relocating loader can put anywhere (loader.hpp).

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include "assembler/diagnostics.hpp"
#include "assembler/object_program.hpp"

namespace sicxe {

struct LinkInput {
  std::string file;       // project path, for diagnostics and origins
  ObjectProgram object;   // the sections of one assembled file
};

// One row of the external symbol table.
struct EstabEntry {
  std::string section;
  std::string symbol;     // empty on a control-section row
  std::size_t address = 0;  // relative to the start of the linked program
  std::size_t length = 0;   // control-section rows only
  std::string sourceFile;
};

struct LinkStep {
  enum class Pass { One, Two } pass = Pass::One;
  std::string text;       // "RDREC placed at 00001E", "+LISTB at 000024"
  std::string file;
  int line = 0;           // the source line the step belongs to
  std::size_t address = 0;
  std::int64_t before = 0, after = 0;  // pass 2: the field before and after this term
  std::string symbol;
};

struct FileDiagnostic {
  std::string file;
  Diagnostic diagnostic;
};

struct LinkResult {
  ObjectProgram linked;               // one section, named after the entry section
  std::vector<OriginRange> origins;   // which file and section each byte range came from
  std::vector<EstabEntry> estab;
  std::vector<LinkStep> trace;
  std::vector<FileDiagnostic> diagnostics;

  bool ok() const {
    for (const auto& d : diagnostics)
      if (d.diagnostic.severity == Severity::Error) return false;
    return true;
  }
};

// The ENTRY file goes first; the other files keep the order given. With errors, `linked`
// holds what was built so far.
LinkResult link(std::vector<LinkInput> inputs);

}  // namespace sicxe
