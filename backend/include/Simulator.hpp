#pragma once

#include "common/byte.hpp"

class ISimulator {
public:
    virtual ~ISimulator() = default;

    virtual void loadProgram(const byte_t* program) = 0;
    virtual void run() = 0;
    virtual void step() = 0;
    virtual void reset() = 0;
};