#include "memory/MemoryAccessor.hpp"

#include <memory>

#include "memory/Memory.hpp"

#include "architecture/events/EventManager.hpp"
#include "architecture/events/InstructionFetched.hpp"
#include "architecture/events/MemoryRead.hpp"
#include "architecture/events/MemoryWrite.hpp"

void MemoryAccessor::write(size_t address, const std::vector<byte_t>& data) {
    std::vector<byte_t> old_value;
    m_parent.read(address, data.size(), old_value);

    m_eventManager.commit(std::make_unique<architecture::events::MemoryWrite>(
        address, data, old_value));

}

void MemoryAccessor::read(size_t address, size_t size, std::vector<byte_t>& buffer) {
    m_parent.read(address, size, buffer);

    m_eventManager.commit(std::make_unique<architecture::events::MemoryRead>(
        address, buffer));

}

void MemoryAccessor::read(size_t address, Iterator begin, Iterator end) {
    m_parent.read(address, begin, end);

    std::vector<byte_t> value(begin, end);
    m_eventManager.commit(std::make_unique<architecture::events::MemoryRead>(
        address, value));

}

void MemoryAccessor::fetch(size_t address, size_t size, std::vector<byte_t>& buffer) {
    m_parent.read(address, size, buffer);

    m_eventManager.commit(std::make_unique<architecture::events::InstructionFetched>(
        address, buffer));

}
