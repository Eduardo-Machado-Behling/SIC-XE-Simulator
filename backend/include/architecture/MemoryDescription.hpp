#pragma once
#include <cstdint>

enum class Endianness
{
    LITTLE_ENDIAN = 0,
    BIG_ENDIAN
};

struct MemoryDescription
{
    uint64_t address_space_size;

    uint32_t address_width;
    uint32_t word_size;
    uint32_t alignment;

    Endianness endianness;
};