#pragma once

class Memory;
class Registers;

namespace architecture::events {

struct EventState {
    virtual ~EventState();
};

struct MemoryEventState : virtual EventState {
    explicit MemoryEventState(::Memory& memory);

    ::Memory& memory;
};

struct RegisterEventState : virtual EventState {
    explicit RegisterEventState(::Registers& registers);

    ::Registers& registers;
};

struct SimulatorEventState final : MemoryEventState, RegisterEventState {
    SimulatorEventState(::Memory& memory, ::Registers& registers);
};

} // namespace architecture::events
