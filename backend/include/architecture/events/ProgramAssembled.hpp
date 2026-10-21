#pragma once

#include "architecture/events/IEvent.hpp"

namespace architecture::events {

// The symbol table of a program the assembler just loaded. It changes no
// simulator state; the editor's Assembler tab shows it.
class ProgramAssembled final : public IEvent {
public:
    explicit ProgramAssembled(nlohmann::json details);

    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    nlohmann::json details;
};

} // namespace architecture::events
