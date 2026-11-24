#include "assembler/linker.hpp"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <map>
#include <set>

namespace sicxe {
namespace {

std::string upper(std::string s) {
  for (char& c : s) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  return s;
}

std::string hex6(std::size_t value) {
  char buf[32];
  std::snprintf(buf, sizeof buf, "%06zX", value);
  return buf;
}

// "dir/dobra.asm" -> "dobra": the name of a section that has none.
std::string stem(const std::string& path) {
  const auto slash = path.find_last_of("/\\");
  std::string name = slash == std::string::npos ? path : path.substr(slash + 1);
  if (const auto dot = name.find_last_of('.'); dot != std::string::npos && dot > 0) name.resize(dot);
  return name;
}

struct Symbol {
  std::size_t address = 0;
  bool absolute = false;
  std::string file;
  int line = 1;
  bool reported = false;
};

struct Placed {
  const LinkInput* input;
  const ControlSection* section;
  std::size_t base;     // CSADDR: where the section starts in the linked program
  std::string name;
};

}  // namespace

LinkResult link(std::vector<LinkInput> inputs) {
  LinkResult out;
  auto error = [&](const std::string& file, int line, std::string message) {
    out.diagnostics.push_back({file, {Severity::Error, std::max(line, 1), 0, std::move(message), 1}});
  };
  inputs.erase(std::remove_if(inputs.begin(), inputs.end(),
                              [](const LinkInput& in) { return in.object.sections.empty(); }),
               inputs.end());
  if (inputs.empty()) return out;

  // The ENTRY file is loaded first, so its transfer address is relative to 0.
  std::stable_partition(inputs.begin(), inputs.end(),
                        [](const LinkInput& in) { return in.object.sections[0].entry; });
  const bool several = inputs.size() > 1;

  // ---- the set of files as a whole -------------------------------------------------
  std::string firstEntryFile;
  for (const LinkInput& in : inputs) {
    const ControlSection& first = in.object.sections[0];
    if (first.entry && firstEntryFile.empty()) firstEntryFile = in.file;
    else if (first.entry) error(in.file, first.startLine, "a second ENTRY (the first is in " + firstEntryFile + ")");
    if (several && !first.entry && first.endOperandLine > 0)
      error(in.file, first.endOperandLine, "only the ENTRY file can name a transfer address");
    for (const ControlSection& section : in.object.sections)
      if (several && section.start != 0) error(in.file, section.startLine, "START must be 0 when files are linked");
  }
  if (several && firstEntryFile.empty()) error(inputs[0].file, 1, "no ENTRY in the linked files");

  // ---- pass 1: place the sections, build the ESTAB ---------------------------------
  std::vector<Placed> placed;
  std::map<std::string, Symbol> estab;
  std::size_t base = 0;
  auto define = [&](const std::string& name, std::size_t address, bool absolute, const LinkInput& in, int line) {
    auto [it, inserted] = estab.emplace(upper(name), Symbol{address, absolute, in.file, std::max(line, 1)});
    if (inserted) return;
    // Both definitions are reported, the first one once.
    if (!it->second.reported) {
      error(it->second.file, it->second.line, name + " is defined twice");
      it->second.reported = true;
    }
    error(in.file, line, name + " is defined twice");
  };
  for (const LinkInput& in : inputs) {
    for (const ControlSection& section : in.object.sections) {
      const std::string name = section.name.empty() ? stem(in.file) : section.name;
      placed.push_back({&in, &section, base, name});
      define(name, base, false, in, section.startLine);
      out.estab.push_back({name, "", base, section.length, in.file});
      out.trace.push_back({LinkStep::Pass::One, name + " placed at " + hex6(base), in.file, section.startLine, base, 0, 0, name});
      for (const auto& [symbol, offset] : section.defines) {
        const bool absolute = section.absoluteDefines.count(symbol) > 0;
        const std::size_t address = absolute ? offset : base + offset;
        define(symbol, address, absolute, in, section.startLine);
        out.estab.push_back({name, symbol, address, 0, in.file});
        out.trace.push_back({LinkStep::Pass::One, symbol + " = " + hex6(address), in.file, section.startLine, address, 0, 0, symbol});
      }
      base += section.length;
    }
  }

  // ---- pass 2: copy the text and apply every modification record -------------------
  ControlSection linked;
  const ControlSection& entry = *placed[0].section;
  linked.name = placed[0].name;
  linked.start = entry.start;
  linked.length = base;
  linked.entry = entry.entry;
  linked.startLine = entry.startLine;
  if (entry.transfer) linked.transfer = *entry.transfer;  // the entry section sits at 0

  // The byte at `address` of the linked text, or null past the emitted code.
  auto byteAt = [&](std::size_t address) -> std::uint8_t* {
    for (TextRun& run : linked.text)
      if (address >= run.address && address < run.address + run.bytes.size()) return &run.bytes[address - run.address];
    return nullptr;
  };

  for (const Placed& p : placed) {
    for (const TextRun& run : p.section->text) linked.text.push_back({p.base + run.address, run.bytes});
    for (const InstructionNote& note : p.section->notes)
      linked.notes.push_back({p.base + note.address, note.size, note.line, note.text});
    out.origins.push_back({p.base, p.section->length, p.input->file, p.name});
    for (int line : p.section->fixedFieldLines) {
      out.fixedFields.push_back({p.input->file, line});
      if (p.base != 0) error(p.input->file, line, "this address field cannot be relocated; use format 4 (+) here");
    }
  }

  for (const Placed& p : placed) {
    const std::vector<ModRecord>& mods = p.section->mods;
    for (std::size_t first = 0; first < mods.size();) {
      std::size_t last = first;  // the terms of one field are consecutive records
      while (last < mods.size() && mods[last].address == mods[first].address && mods[last].halfBytes == mods[first].halfBytes) ++last;

      const std::size_t fieldAddress = p.base + mods[first].address;
      const unsigned halfBytes = mods[first].halfBytes;
      const unsigned size = (halfBytes + 1) / 2;
      std::uint8_t* bytes[4] = {};
      bool inside = size <= 4;
      for (unsigned i = 0; inside && i < size; ++i) inside = (bytes[i] = byteAt(fieldAddress + i)) != nullptr;
      if (!inside) {
        error(p.input->file, mods[first].line, "modification record outside the object code");
        first = last;
        continue;
      }
      std::uint64_t raw = 0;
      for (unsigned i = 0; i < size; ++i) raw = (raw << 8) | *bytes[i];
      const std::uint64_t mask = (std::uint64_t{1} << (4 * halfBytes)) - 1;
      std::uint64_t field = raw & mask;

      int net = 0;
      for (std::size_t i = first; i < last; ++i) {
        const ModRecord& mod = mods[i];
        std::size_t value;
        bool relative;
        if (mod.symbol.empty() || upper(mod.symbol) == upper(p.name) || upper(mod.symbol) == upper(p.section->name)) {
          value = p.base;  // the section itself
          relative = true;
        } else if (const auto symbol = estab.find(upper(mod.symbol)); symbol != estab.end()) {
          value = symbol->second.address;
          relative = !symbol->second.absolute;
        } else {
          error(p.input->file, mod.line, "undefined external symbol " + mod.symbol);
          continue;
        }
        const std::uint64_t before = field;
        field = (mod.sign == '+' ? field + value : field - value) & mask;
        if (relative) net += mod.sign == '+' ? 1 : -1;
        out.trace.push_back({LinkStep::Pass::Two, std::string(1, mod.sign) + mod.symbol + " at " + hex6(fieldAddress),
                             p.input->file, mod.line, fieldAddress, static_cast<std::int64_t>(before),
                             static_cast<std::int64_t>(field), mod.symbol});
      }

      raw = (raw & ~mask) | field;
      for (unsigned i = 0; i < size; ++i) *bytes[i] = static_cast<std::uint8_t>(raw >> (8 * (size - 1 - i)));
      if (net != 0 && net != 1) {
        error(p.input->file, mods[first].line, "relocation of this field is not 0 or 1 (net " + std::to_string(net) + ")");
      } else if (net == 1) {
        linked.mods.push_back({fieldAddress, halfBytes, '+', linked.name, mods[first].line});
      }
      first = last;
    }
  }

  out.linked.sections.push_back(std::move(linked));
  return out;
}

}  // namespace sicxe
