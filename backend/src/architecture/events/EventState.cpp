#include "architecture/events/EventState.hpp"

namespace architecture::events {

EventState::~EventState() = default;

MemoryEventState::MemoryEventState(::Memory& memory)
    : memory(memory) {}

RegisterEventState::RegisterEventState(::Registers& registers)
    : registers(registers) {}

SimulatorEventState::SimulatorEventState(::Memory& memory, ::Registers& registers)
    : MemoryEventState(memory), RegisterEventState(registers) {}

} // namespace architecture::events
