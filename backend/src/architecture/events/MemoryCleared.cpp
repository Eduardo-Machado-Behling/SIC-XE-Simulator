#include "architecture/events/MemoryCleared.hpp"

#include "memory/Memory.hpp"

namespace architecture::events {

namespace {

// Zero gaps shorter than this stay inside a run: a separate run costs about
// as much as this many bytes of vector and address bookkeeping.
constexpr std::size_t kMaxZeroGapInRun = 32;

} // namespace

bool MemoryCleared::mutates() const noexcept { return true; }

void MemoryCleared::commit(EventState& state) {
    auto& memory = dynamic_cast<MemoryEventState&>(state).memory;

    std::vector<byte_t> bytes;
    memory.read(0, memory.size(), bytes);

    previous.clear();
    std::size_t i = 0;
    while (i < bytes.size()) {
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
