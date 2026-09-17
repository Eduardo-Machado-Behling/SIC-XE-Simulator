#pragma once

#include "common/Byte.hpp"
#include "LinkQueue.hpp"


class Registers;

struct RegisterAccessor : public LinkQueue {
    void write(const char* name, uint64_t value);
    void write(uint8_t id, uint64_t value);

    uint64_t read(const char* name);
    uint64_t read(uint8_t id);

private:
    RegisterAccessor(Registers& parent)
        : m_parent(parent) {}

    Registers& m_parent;


    friend class Registers;
};
