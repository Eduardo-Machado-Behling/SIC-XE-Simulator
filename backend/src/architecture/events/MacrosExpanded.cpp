#include "architecture/events/MacrosExpanded.hpp"

#include <utility>

namespace architecture::events {

MacrosExpanded::MacrosExpanded(nlohmann::json details)
    : details(std::move(details)) {}

bool MacrosExpanded::mutates() const noexcept { return false; }

void MacrosExpanded::commit(EventState&) {}

void MacrosExpanded::restore(EventState&) {}

nlohmann::json MacrosExpanded::serialize() const {
    return {{"type", "MacrosExpanded"}, {"details", details}};
}

} // namespace architecture::events
