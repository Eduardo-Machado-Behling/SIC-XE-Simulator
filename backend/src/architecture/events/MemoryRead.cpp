#include "architecture/events/MemoryRead.hpp"

#include <utility>

namespace architecture::events {

MemoryRead::MemoryRead(std::uint64_t address, std::vector<byte_t> value)
    : address(address), value(std::move(value)) {}

bool MemoryRead::mutates() const noexcept { return false; }

void MemoryRead::commit(EventState&) {}

void MemoryRead::restore(EventState&) {}

nlohmann::json MemoryRead::serialize() const {
    return {{"type", "MemoryRead"}, {"address", address}, {"value", value}};
}

} // namespace architecture::events
