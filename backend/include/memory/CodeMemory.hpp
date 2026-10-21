#pragma once
// Sparse, byte-addressable memory image produced by the assembler.
//
// Storage is a set of maximal contiguous segments keyed by start address, so a
// program that occupies [0x0000..0x007F] and [0x1000..0x1009] costs ~138 bytes
// regardless of the 1 MB SIC/XE address space.
//
// Invariant: segments never overlap and are never adjacent (adjacent segments
// are merged on write), so segments() maps 1:1 onto object-file text records.

#include <cstddef>
#include <cstdint>
#include <iterator>
#include <map>
#include <optional>
#include <vector>

#include "common/Byte.hpp"

struct CodeMemory {
  using Segment = std::vector<byte_t>;

  void write(std::size_t addr, byte_t value) {
    auto next = segments_.upper_bound(addr);          // first segment starting after addr
    if (next != segments_.begin()) {
      auto prev = std::prev(next);
      const std::size_t end = prev->first + prev->second.size();
      if (addr < end) {                                // overwrite inside a segment
        prev->second[addr - prev->first] = value;
        return;
      }
      if (addr == end) {                               // extend previous segment
        prev->second.push_back(value);
        if (next != segments_.end() && next->first == addr + 1) {  // bridge a 1-byte gap
          prev->second.insert(prev->second.end(), next->second.begin(), next->second.end());
          segments_.erase(next);
        }
        return;
      }
    }
    if (next != segments_.end() && next->first == addr + 1) {      // extend next segment downwards
      auto node = segments_.extract(next);
      node.key() = addr;
      node.mapped().insert(node.mapped().begin(), value);
      segments_.insert(std::move(node));
      return;
    }
    segments_.emplace(addr, Segment{value});           // brand-new segment
  }

  void clear() { segments_.clear(); }

  bool contains(std::size_t addr) const { return find(addr) != segments_.end(); }

  std::optional<byte_t> read(std::size_t addr) const {
    auto it = find(addr);
    if (it == segments_.end()) return std::nullopt;
    return it->second[addr - it->first];
  }

  bool empty() const { return segments_.empty(); }

  std::size_t byteCount() const {
    std::size_t n = 0;
    for (const auto& [_, seg] : segments_) n += seg.size();
    return n;
  }

  // Read-only view for object-file / hex-dump / simulator-loader code.
  const std::map<std::size_t, Segment>& segments() const { return segments_; }

 private:
  using Map = std::map<std::size_t, Segment>;

  Map::const_iterator find(std::size_t addr) const {
    auto it = segments_.upper_bound(addr);
    if (it == segments_.begin()) return segments_.end();
    --it;
    return addr < it->first + it->second.size() ? it : segments_.end();
  }

  Map segments_;
};
