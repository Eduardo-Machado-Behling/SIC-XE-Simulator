#include "architecture/events/EventManager.hpp"

#include <stdexcept>
#include <utility>

namespace architecture::events {

EventManager::EventManager(::Memory& memory, ::Registers& registers)
    : m_state(memory, registers) {}

void EventManager::execute(std::unique_ptr<IEvent> event) {
    if (!event) {
        throw std::invalid_argument("EventManager cannot execute a null event");
    }

    m_history.reserve(m_history.size() + 1);
    m_execution_order.reserve(m_execution_order.size() + 1);
    event->commit(m_state);

    // Keep every event in the append-only log. A new command after undo
    // replaces only the active redo path, not the recorded history.
    m_execution_order.resize(m_cursor);
    m_history.push_back(std::move(event));
    m_execution_order.push_back(m_history.size() - 1);
    m_cursor = m_execution_order.size();
}

void EventManager::commit(std::unique_ptr<IEvent> event) {
    execute(std::move(event));
}

bool EventManager::undo() {
    while (m_cursor > 0) {
        const std::size_t order_index = m_cursor - 1;
        IEvent& event = *m_history[m_execution_order[order_index]];
        if (!event.mutates()) {
            m_cursor = order_index;
            continue;
        }

        event.restore(m_state);
        m_cursor = order_index;
        return true;
    }
    return false;
}

bool EventManager::redo() {
    while (m_cursor < m_execution_order.size()) {
        IEvent& event = *m_history[m_execution_order[m_cursor]];
        if (!event.mutates()) {
            ++m_cursor;
            continue;
        }

        event.commit(m_state);
        ++m_cursor;
        return true;
    }
    return false;
}

nlohmann::json EventManager::events_since(std::size_t index) const {
    if (index > m_history.size()) {
        throw std::out_of_range("Event history cursor is out of range");
    }

    auto result = nlohmann::json::array();
    for (std::size_t i = index; i < m_history.size(); ++i) {
        result.push_back(m_history[i]->serialize());
    }
    return result;
}

std::size_t EventManager::size() const noexcept { return m_history.size(); }

std::size_t EventManager::cursor() const noexcept { return m_cursor; }

bool EventManager::can_undo() const noexcept {
    for (std::size_t i = m_cursor; i > 0; --i) {
        if (m_history[m_execution_order[i - 1]]->mutates()) {
            return true;
        }
    }
    return false;
}

bool EventManager::can_redo() const noexcept {
    for (std::size_t i = m_cursor; i < m_execution_order.size(); ++i) {
        if (m_history[m_execution_order[i]]->mutates()) {
            return true;
        }
    }
    return false;
}

void EventManager::clear() noexcept {
    m_history.clear();
    m_execution_order.clear();
    m_cursor = 0;
}

} // namespace architecture::events
