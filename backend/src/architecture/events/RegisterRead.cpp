#include "architecture/events/RegisterRead.hpp"

#include <utility>

namespace architecture::events {

RegisterRead::RegisterRead(std::string name, std::vector<byte_t> value)
    : name(std::move(name)), value(std::move(value)) {}

bool RegisterRead::mutates() const noexcept { return false; }

void RegisterRead::commit(EventState&) {}

void RegisterRead::restore(EventState&) {}

nlohmann::json RegisterRead::serialize() const {
    return {{"type", "RegisterRead"}, {"name", name}, {"value", value}};
}

} // namespace architecture::events
