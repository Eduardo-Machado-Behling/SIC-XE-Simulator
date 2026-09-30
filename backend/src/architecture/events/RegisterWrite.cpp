#include "architecture/events/RegisterWrite.hpp"

#include <utility>

#include "memory/Registers.hpp"

namespace architecture::events {

RegisterWrite::RegisterWrite(std::string name, std::vector<byte_t> value,
                             std::vector<byte_t> old_value)
    : name(std::move(name)), value(std::move(value)), old_value(std::move(old_value)) {}

bool RegisterWrite::mutates() const noexcept { return true; }

void RegisterWrite::commit(EventState& state) {
    auto& register_state = dynamic_cast<RegisterEventState&>(state);
    register_state.registers.write(name.c_str(), value);
}

void RegisterWrite::restore(EventState& state) {
    auto& register_state = dynamic_cast<RegisterEventState&>(state);
    register_state.registers.write(name.c_str(), old_value);
}

nlohmann::json RegisterWrite::serialize() const {
    return {{"type", "RegisterWrite"}, {"name", name},
            {"value", value}, {"old_value", old_value}};
}

} // namespace architecture::events
