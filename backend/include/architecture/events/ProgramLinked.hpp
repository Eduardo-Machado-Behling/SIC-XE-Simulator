#pragma once

#include "architecture/events/IEvent.hpp"

namespace architecture::events {

// What the linker and the relocating loader did: the ESTAB, each file's object program, the
// linked program (.out) with its bands, and the trace. It changes no simulator state; the
// editor's tabs show it. It is emitted before memory is written, so a failed link still
// reaches the client with what was built.
class ProgramLinked final : public IEvent {
public:
    explicit ProgramLinked(nlohmann::json details);

    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    nlohmann::json details;
};

} // namespace architecture::events
