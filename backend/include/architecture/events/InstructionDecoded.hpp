#pragma once

#include "architecture/events/IEvent.hpp"

namespace architecture::events {

class InstructionDecoded final : public IEvent {
public:
    explicit InstructionDecoded(nlohmann::json details);

    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    nlohmann::json details;
};

} // namespace architecture::events
