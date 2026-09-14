#pragma once

struct Instruction {
    uint8_t opcode;
    uint8_t format;
    uint8_t addressing_mode;

    virtual void execute() = 0;
};