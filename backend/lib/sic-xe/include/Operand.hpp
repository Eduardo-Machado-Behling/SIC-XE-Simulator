#pragma once

#include <cstdint>

struct ExecutionContext;

// Operand access for Format 3/4 instructions.
//
// target_address is the TA as Beck defines it (Fig. 1.1): the decoder must fold
// PC/base-relative, index and format 4 into it, but not n/i. With n=1, i=0
// (indirect) TA holds the operand's address; with n=0, i=1 (immediate) TA is
// the operand itself. Words are 24 bits, big-endian (MSB at the lowest address).
//
// Data instructions (loads, arithmetic, compare) use operandWord/operandByte,
// stores use storeWord/storeByte, and jumps use operandAddress.
namespace sicxe {

// Where the operand lives in memory: TA, or the word stored at TA when indirect.
std::uint32_t operandAddress(ExecutionContext& context);

// 24-bit operand: TA itself when immediate, otherwise the word at operandAddress().
std::uint32_t operandWord(ExecutionContext& context);

// 8-bit operand: the rightmost byte of TA when immediate, otherwise the byte at operandAddress().
std::uint8_t operandByte(ExecutionContext& context);

// m..m+2 <- the low 24 bits of value, at operandAddress(). Throws IllegalInstruction when immediate.
void storeWord(ExecutionContext& context, std::uint32_t value);

// m <- value, at operandAddress(). Throws IllegalInstruction when immediate.
void storeByte(ExecutionContext& context, std::uint8_t value);

} // namespace sicxe
