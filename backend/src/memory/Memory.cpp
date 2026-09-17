#include "memory/Memory.hpp"

#include <algorithm>
#include <regex>

MemoryAccessor Memory::getAccessor() {
    return MemoryAccessor(*this);
}

void Memory::clear() {
    std::fill(m_memory.begin(), m_memory.end(), 0);
}

void Memory::resize(size_t size) {
    m_memory.resize(size);
}

std::vector<ExecutionEvent> Memory::load(std::stringstream hexDump) {
    std::string buff;

    std::vector<byte_t> data;
    for (size_t i = 0; std::getline(hexDump, buff, '\n'); i++) {
        byte_t byte = static_cast<byte_t>(std::stoull(buff, nullptr, 16));
        m_memory[i] = byte;
        data.push_back(byte);
    }

    return {MemoryWrite{.address=0, .value=data}};
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