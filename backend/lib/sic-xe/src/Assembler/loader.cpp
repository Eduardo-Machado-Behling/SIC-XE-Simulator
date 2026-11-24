#include "assembler/loader.hpp"

#include <algorithm>
#include <cstdio>

namespace sicxe {

namespace {
std::string hex6(std::size_t value) {
  char buf[32];
  std::snprintf(buf, sizeof buf, "%06zX", value);
  return buf;
}
}  // namespace

LoadResult relocateAndLoad(const LinkResult& linked, std::size_t loadAddress, std::size_t memorySize) {
  LoadResult out;
  if (linked.linked.sections.empty()) return out;
  const ControlSection& section = linked.linked.sections[0];
  const std::string entryFile = linked.origins.empty() ? std::string() : linked.origins[0].sourceFile;
  auto error = [&](const std::string& file, int line, std::string message) {
    out.diagnostics.push_back({file, {Severity::Error, std::max(line, 1), 0, std::move(message), 1}});
  };
  auto fileAt = [&](std::size_t address) {
    for (const OriginRange& origin : linked.origins)
      if (address >= origin.start && address < origin.start + origin.length) return origin.sourceFile;
    return entryFile;
  };

  const bool absolute = section.start != 0;
  if (absolute && loadAddress != 0)
    error(entryFile, section.startLine, "an absolute program cannot be relocated; set the load address to 0");
  const std::size_t delta = absolute ? 0 : loadAddress;
  const std::size_t end = (absolute ? section.start : delta) + section.length;
  if (end > memorySize)
    error(entryFile, section.startLine, "the program does not fit in memory: it ends at " + hex6(end) +
                                            " and memory ends at " + hex6(memorySize));
  if (delta != 0)
    for (const FixedField& field : linked.fixedFields)
      error(field.file, field.line, "this address field cannot be relocated; use format 4 (+) here");
  if (!out.ok()) return out;

  // Add the load address to every field that is relative to the program (the +PROG records).
  std::vector<TextRun> text = section.text;
  auto byteAt = [&](std::size_t address) -> std::uint8_t* {
    for (TextRun& run : text)
      if (address >= run.address && address < run.address + run.bytes.size()) return &run.bytes[address - run.address];
    return nullptr;
  };
  if (delta != 0) {
    for (const ModRecord& mod : section.mods) {
      const unsigned size = (mod.halfBytes + 1) / 2;
      std::uint8_t* bytes[4] = {};
      bool inside = size <= 4;
      for (unsigned i = 0; inside && i < size; ++i) inside = (bytes[i] = byteAt(mod.address + i)) != nullptr;
      if (!inside) {
        error(fileAt(mod.address), mod.line, "modification record outside the object code");
        continue;
      }
      std::uint64_t raw = 0;
      for (unsigned i = 0; i < size; ++i) raw = (raw << 8) | *bytes[i];
      const std::uint64_t mask = (std::uint64_t{1} << (4 * mod.halfBytes)) - 1;
      const std::uint64_t before = raw & mask;
      const std::uint64_t after = before + delta;
      if (after > mask) {
        error(fileAt(mod.address), mod.line, "the relocated address field overflows its " +
                                                 std::to_string(mod.halfBytes) + " half-bytes");
        continue;
      }
      raw = (raw & ~mask) | after;
      for (unsigned i = 0; i < size; ++i) *bytes[i] = static_cast<std::uint8_t>(raw >> (8 * (size - 1 - i)));
      out.trace.push_back({delta + mod.address, static_cast<std::int64_t>(before), static_cast<std::int64_t>(after)});
    }
    if (!out.ok()) return out;
  }

  for (const TextRun& run : text)
    for (std::size_t i = 0; i < run.bytes.size(); ++i) out.memory.write(delta + run.address + i, run.bytes[i]);
  out.entryPoint = absolute ? (section.transfer ? *section.transfer : section.start)
                            : delta + (section.transfer ? *section.transfer : 0);
  for (const InstructionNote& note : section.notes)
    out.sourceMap.push_back({delta + note.address, note.size, fileAt(note.address), note.line});
  return out;
}

}  // namespace sicxe
