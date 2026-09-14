#pragma once

#include "common/byte.hpp"

#include <vector>

struct MemoryLayout {
    size_t registers;
    size_t flags;
    size_t memory;

    MemoryLayout(size_t flags, size_t memory, size_t registers = 0)
        : registers(registers), flags(flags), memory(memory) {}
};

class AbstractMemory {
public:
    AbstractMemory(std::vector<byte_t>& data, const MemoryLayout& layout)
        : data(data), offsets(layout) {}

private:
  std::vector<byte_t>& data;
  MemoryLayout offsets;
};