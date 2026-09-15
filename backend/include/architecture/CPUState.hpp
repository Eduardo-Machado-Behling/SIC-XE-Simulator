#pragma once

#include <cstdint>
#include <unordered_map>
#include <string>

#include "memory/Registers.hpp"

struct CPUState {
    std::uint64_t program_counter;

    Registers registers;
};