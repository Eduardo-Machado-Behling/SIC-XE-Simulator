#include "architecture/events/InstructionFetched.hpp"

#include <utility>

namespace architecture::events {

InstructionFetched::InstructionFetched(std::uint64_t address, std::vector<byte_t> value)
    : address(address), value(std::move(value)) {}

bool InstructionFetched::mutates() const noexcept { return false; }

void InstructionFetched::commit(EventState&) {}

void InstructionFetched::restore(EventState&) {}

nlohmann::json InstructionFetched::serialize() const {
    return {{"type", "InstructionFetched"}, {"address", address}, {"value", value}};
}

} // namespace architecture::events
