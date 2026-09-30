#pragma once

#include <cstddef>
#include <memory>
#include <vector>

#include "architecture/events/IEvent.hpp"
#include "architecture/events/InstructionExecutor.hpp"

namespace architecture::events {

class EventManager final : public InstructionExecutor {
public:
    EventManager(::Memory& memory, ::Registers& registers);

    void execute(std::unique_ptr<IEvent> event) override;
    void commit(std::unique_ptr<IEvent> event);
    bool undo();
    bool redo();
    nlohmann::json events_since(std::size_t index = 0) const;

    std::size_t size() const noexcept;
    std::size_t cursor() const noexcept;
    bool can_undo() const noexcept;
    bool can_redo() const noexcept;
    void clear() noexcept;

private:
    SimulatorEventState m_state;
    // Append-only event log; events from superseded redo paths remain here.
    std::vector<std::unique_ptr<IEvent>> m_history;
    // Indices describing the currently active undo/redo path in m_history.
    std::vector<std::size_t> m_execution_order;
    // Number of history entries currently represented in simulator state.
    std::size_t m_cursor = 0;
};

} // namespace architecture::events
