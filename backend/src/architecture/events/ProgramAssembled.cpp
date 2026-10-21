#include "architecture/events/ProgramAssembled.hpp"

#include <utility>

namespace architecture::events {

ProgramAssembled::ProgramAssembled(nlohmann::json details)
    : details(std::move(details)) {}

bool ProgramAssembled::mutates() const noexcept { return false; }

void ProgramAssembled::commit(EventState&) {}

void ProgramAssembled::restore(EventState&) {}

nlohmann::json ProgramAssembled::serialize() const {
    return {{"type", "ProgramAssembled"}, {"details", details}};
}

} // namespace architecture::events
