#include "architecture/events/MemoryWrite.hpp"

#include <cstddef>
#include <utility>

#include "memory/Memory.hpp"

namespace architecture::events {

MemoryWrite::MemoryWrite(std::uint64_t address, std::vector<byte_t> value,
                         std::vector<byte_t> old_value)
    : address(address), value(std::move(value)), old_value(std::move(old_value)) {}

bool MemoryWrite::mutates() const noexcept { return true; }

void MemoryWrite::commit(EventState& state) {
    auto& memory_state = dynamic_cast<MemoryEventState&>(state);
    memory_state.memory.write(static_cast<std::size_t>(address), value);
}

void MemoryWrite::restore(EventState& state) {
    auto& memory_state = dynamic_cast<MemoryEventState&>(state);
    memory_state.memory.write(static_cast<std::size_t>(address), old_value);
}

nlohmann::json MemoryWrite::serialize() const {
    return {{"type", "MemoryWrite"}, {"address", address},
            {"value", value}, {"old_value", old_value}};
}

} // namespace architecture::events
