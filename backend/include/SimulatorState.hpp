#pragma once 

#include "common/byte.hpp"
#include "observer/PullObserver.hpp"
#include "AbstractMemory.hpp"

#include <vector>
#include <unordered_map>
#include <string>
#include <cstdint>

class SimulatorState {
public:
    SimulatorState(AbstractMemory& memory);
    ~SimulatorState() = default;

    std::string toJSON() const;

private:
    bool isRunning = false;

    AbstractMemory& memory;
};