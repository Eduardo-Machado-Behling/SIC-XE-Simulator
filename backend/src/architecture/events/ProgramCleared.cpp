#include "architecture/events/ProgramCleared.hpp"

namespace architecture::events {

bool ProgramCleared::mutates() const noexcept { return false; }

void ProgramCleared::commit(EventState&) {}

void ProgramCleared::restore(EventState&) {}

nlohmann::json ProgramCleared::serialize() const {
    return {{"type", "ProgramCleared"}};
}

} // namespace architecture::events
