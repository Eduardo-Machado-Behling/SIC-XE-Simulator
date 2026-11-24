#pragma once
// The data handed from the assembler to the linker and from the linker to the loader:
// Beck's object program (H, D, R, T, M, E records) plus what the UI needs to show where
// every byte came from. The .obj/.out text is rendered from this value (object_text.hpp);
// it is never parsed back.

#include <cstddef>
#include <cstdint>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

namespace sicxe {

// Revised modification record (Beck 2.3.5): add (+) or subtract (-) the value of
// `symbol` to the field of `halfBytes` hex digits at `address`. Local relocation names
// the section itself.
struct ModRecord {
  std::size_t address = 0;  // section-relative
  unsigned halfBytes = 0;   // 5 (format-4 field) or 6 (WORD)
  char sign = '+';
  std::string symbol;
  int line = 0;             // 1-based line of the source that needs the fix
};

struct TextRun {
  std::size_t address = 0;  // section-relative
  std::vector<std::uint8_t> bytes;
};

// One emitted statement: lets the writer decode bytes back into source text.
struct InstructionNote {
  std::size_t address = 0;  // section-relative
  std::size_t size = 0;
  int line = 0;
  std::string text;         // the statement, e.g. "+JSUB DOBRA"
};

struct ControlSection {
  std::string name;
  std::size_t start = 0;    // operand of START/ENTRY; 0 for CSECT
  std::size_t length = 0;
  std::vector<std::pair<std::string, std::size_t>> defines;  // D: name, section-relative address
  std::vector<std::string> refers;                           // R
  std::vector<TextRun> text;                                 // T
  std::vector<ModRecord> mods;                               // M
  std::optional<std::size_t> transfer;                       // E: section-relative
  std::map<std::string, std::int64_t> symbols;               // every label, for the UI
  std::set<std::string> absoluteDefines;                     // EXTDEF names whose value is absolute
  std::vector<int> fixedFieldLines;                          // lines holding a section address no M record can fix
  bool entry = false;                                        // opened by ENTRY
  int startLine = 0;
  int endOperandLine = 0;                                    // line of an END that names a transfer address
  std::string sourceFile;
  std::vector<InstructionNote> notes;
};

struct ObjectProgram {
  std::vector<ControlSection> sections;
};

// Where a byte range of the linked program came from.
struct OriginRange {
  std::size_t start = 0;
  std::size_t length = 0;
  std::string sourceFile;
  std::string section;
};

}  // namespace sicxe
