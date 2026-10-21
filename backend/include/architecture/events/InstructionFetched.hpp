#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <vector>

#include "common/Byte.hpp"
#include "architecture/events/IEvent.hpp"

namespace architecture::events {

class InstructionFetched final : public IEvent {
public:
    InstructionFetched(std::uint64_t address,
                       std::vector<byte_t> value,
                       std::optional<std::size_t> sourceLine = std::nullopt,
                       bool preview = false);

    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    std::uint64_t address;
    std::vector<byte_t> value;
    std::optional<std::size_t> sourceLine;
    bool preview;
};

} // namespace architecture::events
