#include "memory/MemoryAccessor.hpp"

#include <limits>
#include <memory>
#include <utility>

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

void MemoryAccessor::write(size_t address, const CodeMemory& data) {
    struct PendingWrite {
        size_t address;
        std::vector<byte_t> value;
        std::vector<byte_t> old_value;
    };

    std::vector<PendingWrite> writes;
    writes.reserve(data.segments().size());

    // Validate and capture every old segment before committing any of them,
    // so an out-of-bounds segment cannot leave a partially loaded image.
    for (const auto& [segment_address, segment] : data.segments()) {
        if (segment_address > std::numeric_limits<size_t>::max() - address) {
            throw MemoryOutOfBoundsException("Write operation exceeds memory bounds");
        }

        const size_t target_address = address + segment_address;
        if (segment.size() > std::numeric_limits<size_t>::max() - target_address) {
            throw MemoryOutOfBoundsException("Write operation exceeds memory bounds");
        }

        std::vector<byte_t> value;
        value.reserve(segment.size());
        for (const auto byte : segment) {
            value.push_back(static_cast<byte_t>(byte));
        }

        std::vector<byte_t> old_value;
        m_parent.read(target_address, value.size(), old_value);
        writes.push_back({target_address, std::move(value), std::move(old_value)});
    }

    for (auto& write : writes) {
        m_eventManager.commit(std::make_unique<architecture::events::MemoryWrite>(
            write.address, std::move(write.value), std::move(write.old_value)));
    }
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
