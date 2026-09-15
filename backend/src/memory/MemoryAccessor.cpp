#include "memory/MemoryAccessor.hpp"

#include "memory/Memory.hpp"

void MemoryAccessor::write(size_t address, const std::vector<byte_t>& data) {
    m_parent.write(address, data);
    if (m_queue)
        m_queue->push(MemoryWrite{address, data});
}

void MemoryAccessor::read(size_t address, size_t size, std::vector<byte_t>& buffer) {
    m_parent.read(address, size, buffer);

    if (m_queue)
        m_queue->push(MemoryRead{address, buffer});
}

void MemoryAccessor::fetch(size_t address, size_t size, std::vector<byte_t>& buffer) {
    m_parent.read(address, size, buffer);
    if (m_queue)
        m_queue->push(InstructionFetched{address, buffer});
}