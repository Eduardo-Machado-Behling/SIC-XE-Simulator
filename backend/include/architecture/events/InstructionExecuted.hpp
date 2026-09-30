#pragma once

#include "architecture/InstructionDescription.hpp"
#include "architecture/events/IEvent.hpp"

namespace architecture::events {

class InstructionExecuted final : public IEvent {
public:
    explicit InstructionExecuted(const InstructionDescription* instruction);

    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    const InstructionDescription* instruction;
};

} // namespace architecture::events
