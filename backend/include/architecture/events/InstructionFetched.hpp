#pragma once

#include <cstdint>
#include <vector>

#include "common/Byte.hpp"
#include "architecture/events/IEvent.hpp"

namespace architecture::events {

class InstructionFetched final : public IEvent {
public:
    InstructionFetched(std::uint64_t address, std::vector<byte_t> value);

    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    std::uint64_t address;
    std::vector<byte_t> value;
};

} // namespace architecture::events
