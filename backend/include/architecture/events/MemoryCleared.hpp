#pragma once

#include <cstddef>
#include <utility>
#include <vector>

#include "common/Byte.hpp"
#include "architecture/events/IEvent.hpp"

namespace architecture::events {

// The whole memory was zero-filled (the Clear button, and the start of every
// program load). Registers are not touched. It serializes as just
// {"type":"MemoryCleared"}: the previous contents stay in this object, so
// restore() can put them back on undo.
class MemoryCleared final : public IEvent {
public:
    bool mutates() const noexcept override;
    void commit(EventState& state) override;
    void restore(EventState& state) override;
    nlohmann::json serialize() const override;

private:
    // The non-zero parts of the memory before commit(), as (address, bytes)
    // runs. A program uses a few hundred bytes of the 1 MB SIC/XE memory, and
    // every load keeps one of these in the event history, so a full copy
    // would cost 1 MB per run.
    std::vector<std::pair<std::size_t, std::vector<byte_t>>> previous;
};

} // namespace architecture::events
