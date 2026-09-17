#pragma once

#include <exception>
#include <sstream>
#include <vector>

#include "memory/MemoryAccessor.hpp"

struct MemoryOutOfBoundsException : public std::exception {
    MemoryOutOfBoundsException(const char* message)
        : msg(message) {}

    const char* what() const noexcept override { return msg; }

private:
    const char* msg;
};
class Memory {
public:
    void resize(size_t size);
    std::vector<ExecutionEvent> load(std::stringstream hexDump);

    void write(size_t address, const std::vector<byte_t>& data);
    void read(size_t address, size_t size, std::vector<byte_t>& buffer) const;
    void clear();

    MemoryAccessor getAccessor();

private:
    std::vector<byte_t> m_memory;
};
