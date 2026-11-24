#include "architecture/events/ProgramLinked.hpp"

#include <utility>

namespace architecture::events {

ProgramLinked::ProgramLinked(nlohmann::json details)
    : details(std::move(details)) {}

bool ProgramLinked::mutates() const noexcept { return false; }

void ProgramLinked::commit(EventState&) {}

void ProgramLinked::restore(EventState&) {}

nlohmann::json ProgramLinked::serialize() const {
    return {{"type", "ProgramLinked"}, {"details", details}};
}

} // namespace architecture::events
