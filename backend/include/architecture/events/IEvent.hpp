#pragma once

#include "pch/JSON.hpp"
#include "architecture/events/EventState.hpp"

namespace architecture::events {

struct IEvent {
    virtual ~IEvent();

    virtual bool mutates() const noexcept = 0;
    virtual void commit(EventState& state) = 0;
    virtual void restore(EventState& state) = 0;
    virtual nlohmann::json serialize() const = 0;
};

} // namespace architecture::events
