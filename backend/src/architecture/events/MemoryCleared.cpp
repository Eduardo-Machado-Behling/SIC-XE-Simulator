#include "architecture/events/MemoryCleared.hpp"

#include <utility>

#include "memory/Memory.hpp"

namespace architecture::events {

MemoryCleared::MemoryCleared(std::vector<byte_t> previous)
    : previous(std::move(previous)) {}

bool MemoryCleared::mutates() const noexcept { return true; }

void MemoryCleared::commit(EventState& state) {
    auto& memory_state = dynamic_cast<MemoryEventState&>(state);
    memory_state.memory.clear();
}

void MemoryCleared::restore(EventState& state) {
    auto& memory_state = dynamic_cast<MemoryEventState&>(state);
    if (!previous.empty())
        memory_state.memory.write(0, previous);
}

nlohmann::json MemoryCleared::serialize() const {
    return {{"type", "MemoryCleared"}};
}

} // namespace architecture::events
