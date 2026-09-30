#include "architecture/events/InstructionDecoded.hpp"

#include <utility>

namespace architecture::events {

InstructionDecoded::InstructionDecoded(nlohmann::json details)
    : details(std::move(details)) {}

bool InstructionDecoded::mutates() const noexcept { return false; }

void InstructionDecoded::commit(EventState&) {}

void InstructionDecoded::restore(EventState&) {}

nlohmann::json InstructionDecoded::serialize() const {
    return {{"type", "InstructionDecoded"}, {"details", details}};
}

} // namespace architecture::events
