#pragma once

#include <cstdint>

// SIC/XE integers are 24-bit words in 2's complement (Beck 1.3.1).
namespace sicxe {

constexpr std::uint32_t WORD_MASK = 0xFFFFFF;

// The low 24 bits of value: what a register or memory word can hold.
std::uint32_t toWord(std::int64_t value);

// A 24-bit word read as a signed integer.
std::int32_t toSigned(std::uint32_t word);

} // namespace sicxe
