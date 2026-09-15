#pragma once

#include "AbstractMemory.hpp"

struct Instruction {
    virtual void execute() = 0;

private:
    AbstractMemory& memory;
};