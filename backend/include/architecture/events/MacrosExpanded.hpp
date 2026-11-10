#pragma once

#include "architecture/events/IEvent.hpp"

namespace architecture::events {

// What the macro processor did before the assembler ran: MASMAPRG.ASM, the
// macro tables, the line map and the trace. It changes no simulator state; it
// is emitted before assembling so it also reaches the client when loading fails.
class MacrosExpanded final : public IEvent {
public:
    explicit MacrosExpanded(nlohmann::json details);

    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    nlohmann::json details;
};

} // namespace architecture::events
