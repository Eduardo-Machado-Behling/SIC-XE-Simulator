#include "assembler/object_text.hpp"

#include <algorithm>
#include <cstdio>
#include <sstream>

namespace sicxe {
namespace {

constexpr std::size_t kMaxRecordBytes = 30;  // Beck: 60 hex digits per T record
constexpr std::size_t kNameWidth = 6;
constexpr std::size_t kCommentColumn = 28;

std::string hex(std::size_t value, int width) {
  char buf[32];
  std::snprintf(buf, sizeof buf, "%0*zX", width, value);
  return buf;
}

std::string padName(const std::string& name) {
  return name.size() >= kNameWidth ? name : name + std::string(kNameWidth - name.size(), ' ');
}

std::string trimRight(std::string s) {
  while (!s.empty() && s.back() == ' ') s.pop_back();
  return s;
}

std::string hexBytes(const std::vector<std::uint8_t>& bytes, std::size_t from, std::size_t count) {
  std::string out;
  for (std::size_t i = 0; i < count; ++i) out += hex(bytes[from + i], 2);
  return out;
}

struct Group {
  std::size_t address;  // section-relative
  std::size_t size;
  std::size_t offset;   // into the run's bytes
  const InstructionNote* note;
};

// Instruction-sized groups where the section has a note, three bytes elsewhere.
std::vector<Group> groupsOf(const ControlSection& section, const TextRun& run) {
  std::map<std::size_t, const InstructionNote*> noteAt;
  for (const auto& note : section.notes) noteAt.emplace(note.address, &note);
  std::vector<Group> groups;
  std::size_t offset = 0;
  while (offset < run.bytes.size()) {
    const std::size_t address = run.address + offset;
    const std::size_t remaining = run.bytes.size() - offset;
    const auto note = noteAt.find(address);
    std::size_t size;
    const InstructionNote* used = nullptr;
    if (note != noteAt.end() && note->second->size >= 1 && note->second->size <= remaining) {
      size = note->second->size;
      used = note->second;
    } else {
      size = std::min<std::size_t>(3, remaining);
      const auto next = noteAt.upper_bound(address);
      if (next != noteAt.end()) size = std::min(size, next->first - address);
    }
    groups.push_back({address, size, offset, used});
    offset += size;
  }
  return groups;
}

int originOf(std::span<const OriginRange> origins, std::size_t address) {
  for (std::size_t i = 0; i < origins.size(); ++i)
    if (address >= origins[i].start && address < origins[i].start + origins[i].length) return static_cast<int>(i);
  return -1;
}

std::string commentFor(const ControlSection& section, const ModRecord& mod) {
  std::string text;
  for (const auto& note : section.notes)
    if (mod.address >= note.address && mod.address < note.address + std::max<std::size_t>(note.size, 1)) text = note.text;
  if (mod.line > 0 && !section.sourceFile.empty()) {
    const std::string where = "(" + section.sourceFile + ":" + std::to_string(mod.line) + ")";
    return text.empty() ? where : text + " " + where;
  }
  return text;
}

}  // namespace

RenderedText renderObjectText(const ObjectProgram& program, std::span<const OriginRange> origins) {
  RenderedText out;
  int line = 0;
  auto emit = [&](const std::string& s) {
    out.text += s;
    out.text += '\n';
    return ++line;
  };
  std::vector<LineBand> bands(origins.size());

  for (const ControlSection& section : program.sections) {
    emit("H " + padName(section.name) + " " + hex(section.start, 6) + " " + hex(section.length, 6));

    for (std::size_t i = 0; i < section.defines.size(); i += 5) {
      std::string row = "D";
      for (std::size_t j = i; j < std::min(section.defines.size(), i + 5); ++j)
        row += " " + padName(section.defines[j].first) + " " + hex(section.defines[j].second, 6);
      emit(row);
    }
    for (std::size_t i = 0; i < section.refers.size(); i += 10) {
      std::string row = "R";
      for (std::size_t j = i; j < std::min(section.refers.size(), i + 10); ++j) row += " " + section.refers[j];
      emit(row);
    }

    for (const TextRun& run : section.text) {
      const std::vector<Group> groups = groupsOf(section, run);
      std::size_t first = 0;
      while (first < groups.size()) {
        // Pack groups into one record: at most 30 bytes, and never across an origin.
        const int origin = originOf(origins, groups[first].address);
        std::size_t last = first, bytes = 0;
        while (last < groups.size() && bytes + groups[last].size <= kMaxRecordBytes &&
               originOf(origins, groups[last].address) == origin) {
          bytes += groups[last].size;
          ++last;
        }
        if (last == first) { bytes = groups[first].size; last = first + 1; }  // a group alone always fits a record

        std::string row = "T " + hex(groups[first].address, 6) + " " + hex(bytes, 2);
        for (std::size_t g = first; g < last; ++g) row += " " + hexBytes(run.bytes, groups[g].offset, groups[g].size);
        const int firstLine = emit(row);
        int lastLine = firstLine;
        for (std::size_t g = first; g < last; ++g) {
          if (!groups[g].note) continue;
          std::string raw = hexBytes(run.bytes, groups[g].offset, groups[g].size);
          raw.resize(std::max<std::size_t>(raw.size(), 10), ' ');
          lastLine = emit("  .  " + hex(groups[g].address, 6) + "  " + raw + "  " + groups[g].note->text);
        }
        if (origin >= 0) {
          LineBand& band = bands[origin];
          if (band.firstLine == 0) band.firstLine = firstLine;
          band.lastLine = lastLine;
        }
        first = last;
      }
    }

    for (const ModRecord& mod : section.mods) {
      std::string row = "M " + hex(mod.address, 6) + " " + hex(mod.halfBytes, 2) + " " + mod.sign + mod.symbol;
      const std::string comment = commentFor(section, mod);
      if (!comment.empty()) {
        if (row.size() < kCommentColumn) row.resize(kCommentColumn, ' ');
        else row += ' ';
        row += ". " + comment;
      }
      emit(row);
    }

    emit(section.transfer ? "E " + hex(*section.transfer, 6) : "E");
  }

  for (std::size_t i = 0; i < origins.size(); ++i) {
    if (bands[i].firstLine == 0) continue;
    bands[i].label = origins[i].sourceFile + " \xC2\xB7 " + origins[i].section;
    out.bands.push_back(bands[i]);
  }
  return out;
}

std::vector<std::string> beckRecords(std::string_view rendered) {
  std::vector<std::string> records;
  std::istringstream input{std::string(rendered)};
  std::string line;
  while (std::getline(input, line)) {
    const std::size_t firstChar = line.find_first_not_of(' ');
    if (firstChar == std::string::npos || line[firstChar] == '.') continue;
    if (const auto comment = line.find(" ."); comment != std::string::npos) line.resize(comment);
    std::istringstream words(line);
    std::vector<std::string> token;
    for (std::string word; words >> word;) token.push_back(word);
    if (token.empty()) continue;

    const std::string kind = token[0];
    std::string record = kind;
    if (kind == "H" && token.size() == 4) {
      record += padName(token[1]) + token[2] + token[3];
    } else if (kind == "D") {
      for (std::size_t i = 1; i + 1 < token.size(); i += 2) record += padName(token[i]) + token[i + 1];
    } else if (kind == "R") {
      for (std::size_t i = 1; i < token.size(); ++i) record += padName(token[i]);
    } else {  // T, M, E: fields are fixed width already
      for (std::size_t i = 1; i < token.size(); ++i) record += token[i];
    }
    records.push_back(trimRight(record));
  }
  return records;
}

}  // namespace sicxe
