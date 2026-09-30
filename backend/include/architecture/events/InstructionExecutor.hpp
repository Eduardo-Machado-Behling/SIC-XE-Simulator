#pragma once

#include <memory>

namespace architecture::events {

class IEvent;

class InstructionExecutor {
public:
    virtual ~InstructionExecutor();
    virtual void execute(std::unique_ptr<IEvent> event) = 0;
};

} // namespace architecture::events
