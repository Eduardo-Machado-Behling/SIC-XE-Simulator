#pragma once

#include <vector>

#include "architecture/events/IEvent.hpp"
#include "common/Byte.hpp"

namespace architecture::events {

// Clears the complete memory image while retaining its previous contents for undo.
class MemoryCleared final : public IEvent {
public:
    explicit MemoryCleared(std::vector<byte_t> previous);

    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    std::vector<byte_t> previous;
};

} // namespace architecture::events
