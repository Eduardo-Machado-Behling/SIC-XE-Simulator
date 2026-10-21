#include "architecture/events/MemoryCleared.hpp"

#include <cstring>

#include "memory/Memory.hpp"

namespace architecture::events {

namespace {

// Zero gaps shorter than this stay inside a run: a separate run costs about
// as much as this many bytes of vector and address bookkeeping.
constexpr std::size_t kMaxZeroGapInRun = 32;

constexpr std::size_t kZeroChunk = 4096;
const byte_t kZeros[kZeroChunk] = {};

} // namespace

bool MemoryCleared::mutates() const noexcept { return true; }

void MemoryCleared::commit(EventState& state) {
    auto& memory = dynamic_cast<MemoryEventState&>(state).memory;

    const std::vector<byte_t>& bytes = memory.bytes();

    previous.clear();
    std::size_t i = 0;
    while (i < bytes.size()) {
        // Most of the memory is zero: skip it a chunk at a time with memcmp,
        // which stays fast in the Debug build the Dockerfile makes (there a
        // byte loop over 1 MB alone took about 2 ms per load).
        if (i % kZeroChunk == 0 && i + kZeroChunk <= bytes.size() &&
            std::memcmp(bytes.data() + i, kZeros, kZeroChunk) == 0) {
            i += kZeroChunk;
            continue;
        }

        if (bytes[i] == 0) {
            ++i;
            continue;
        }

        const std::size_t start = i;
        std::size_t end = i + 1; // one past the last non-zero byte of the run
        for (std::size_t j = end; j < bytes.size() && j - end < kMaxZeroGapInRun; ++j) {
            if (bytes[j] != 0) end = j + 1;
        }

        previous.emplace_back(start, std::vector<byte_t>(bytes.begin() + start, bytes.begin() + end));
        i = end;
    }

    memory.clear();
}

void MemoryCleared::restore(EventState& state) {
    auto& memory = dynamic_cast<MemoryEventState&>(state).memory;

    // Undo runs newest first, so every later event is already undone and the
    // memory is all zeros again: writing the runs back restores it exactly.
    for (const auto& [address, bytes] : previous) {
        memory.write(address, bytes);
    }
}

nlohmann::json MemoryCleared::serialize() const {
    return {{"type", "MemoryCleared"}};
}

} // namespace architecture::events
