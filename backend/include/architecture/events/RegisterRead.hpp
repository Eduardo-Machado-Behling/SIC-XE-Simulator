#pragma once

#include <string>
#include <vector>
#include "common/Byte.hpp"

#include "architecture/events/IEvent.hpp"

namespace architecture::events {

class RegisterRead final : public IEvent {
public:
    RegisterRead(std::string name, std::vector<byte_t> value);

    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    std::string name;
    std::vector<byte_t> value;
};

} // namespace architecture::events
