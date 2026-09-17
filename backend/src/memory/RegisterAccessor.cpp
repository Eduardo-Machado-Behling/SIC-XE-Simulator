#include "memory/RegisterAccessor.hpp"

#include "memory/Registers.hpp"

void RegisterAccessor::write(const char* name, uint64_t value) {
    m_parent.write(name, value);
    if (m_queue)
        m_queue->push(RegisterWrite(name, value));
}

void RegisterAccessor::write(uint8_t id, uint64_t value) {
    m_parent.write(id, value);
    if (m_queue)
        m_queue->push(RegisterWrite(m_parent.getName(id), value));
}

uint64_t RegisterAccessor::read(const char* name) {
    uint64_t value = m_parent.read(name);
    if (m_queue)
        m_queue->push(RegisterRead(name, value));

    return value;
}

uint64_t RegisterAccessor::read(uint8_t id) {
    uint64_t value = m_parent.read(id);
    if (m_queue)
        m_queue->push(RegisterRead(m_parent.getName(id), value));

    return value;
}