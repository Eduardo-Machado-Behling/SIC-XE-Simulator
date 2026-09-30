#include "memory/Memory.hpp"
#include "architecture/events/EventManager.hpp"

#include <algorithm>
#include <regex>

MemoryAccessor Memory::getAccessor(architecture::events::EventManager& eventManager) {
    return MemoryAccessor(*this, eventManager);
}

void Memory::clear() {
    std::fill(m_memory.begin(), m_memory.end(), 0);
}

void Memory::resize(size_t size) {
    m_memory.resize(size);
}

void Memory::write(size_t address, const std::vector<byte_t>& data) {
    if (address + data.size() > m_memory.size()) {
        throw MemoryOutOfBoundsException("Write operation exceeds memory bounds");
    }
    std::copy(data.begin(), data.end(), m_memory.begin() + address);
}

void Memory::read(size_t address, size_t size, std::vector<byte_t>& buffer) const {
    if (address + size > m_memory.size()) {
        throw MemoryOutOfBoundsException("Read operation exceeds memory bounds");
    }

    buffer.resize(size);
    std::copy(m_memory.begin() + address, m_memory.begin() + address + size, buffer.begin());
}

void Memory::read(size_t address, Iterator begin, Iterator end) const {
    auto size = std::distance(begin, end);
    if (address + size > m_memory.size()) {
        throw MemoryOutOfBoundsException("Read operation exceeds memory bounds");
    }

    std::copy(m_memory.begin() + address, m_memory.begin() + address + size, begin);
}
