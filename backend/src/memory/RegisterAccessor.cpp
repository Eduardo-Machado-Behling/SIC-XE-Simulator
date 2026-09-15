#include "memory/RegisterAccessor.hpp"

#include "memory/Registers.hpp"

void RegisterAccessor::write(const char* name, uint64_t value) {
    m_parent.write(name, value);
    if (m_queue)
        m_queue->push(RegisterWrite(name, value));
}

uint64_t RegisterAccessor::read(const char* name) {
    uint64_t value = m_parent.read(name);
    if (m_queue)
        m_queue->push(RegisterRead(name, value));

    return value;
}