#pragma once

#include "architecture/events/IEvent.hpp"

namespace architecture::events {

// Notifies clients that assembler metadata (such as symbols) was discarded.
class ProgramCleared final : public IEvent {
public:
    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;
};

} // namespace architecture::events
