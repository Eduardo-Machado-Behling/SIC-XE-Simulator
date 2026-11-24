#pragma once
// The readable .obj/.out text: Beck's records with their fields spaced apart, the T
// record's object code grouped per instruction, and annotation lines (a leading `.` is
// Beck's comment character) that decode the bytes back into source.

#include <span>
#include <string>
#include <string_view>
#include <vector>

#include "assembler/object_program.hpp"

namespace sicxe {

struct LineBand {
  int firstLine = 0;  // 1-based, inclusive
  int lastLine = 0;
  std::string label;  // "main.asm · PROG"
};

struct RenderedText {
  std::string text;
  std::vector<LineBand> bands;  // one per origin that has a T record
};

// `origins` are in the program's own addresses; with them, each T record (and its
// annotation lines) belongs to the origin that holds its first byte.
RenderedText renderObjectText(const ObjectProgram& program, std::span<const OriginRange> origins = {});

// The comparison form of the records in `rendered` (spec 6.2): annotations dropped,
// names padded to six columns, spaces removed. Matches Beck's column-format figures.
std::vector<std::string> beckRecords(std::string_view rendered);

}  // namespace sicxe
