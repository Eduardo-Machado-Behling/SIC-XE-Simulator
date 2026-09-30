#pragma once

#include <vector>
#include "common/Byte.hpp"
#include <string>

#include "architecture/events/IEvent.hpp"

namespace architecture::events {

class RegisterWrite final : public IEvent {
public:
    RegisterWrite(std::string name, std::vector<byte_t> value, std::vector<byte_t> old_value);

    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    std::string name;
    std::vector<byte_t> value;
    std::vector<byte_t> old_value;
};

} // namespace architecture::events
