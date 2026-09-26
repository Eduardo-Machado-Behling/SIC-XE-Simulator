#pragma once

#include <cstdint>
#include <vector>

#include "DecodedInstruction.hpp"
#include "common/Byte.hpp"

class InstructionSet;
struct RegisterAccessor;

namespace sicxe {

// SIC/XE memory: 1 MB (Beck 1.3.2).
constexpr std::uint32_t MEMORY_SIZE = 1u << 20;

// Decodes the instruction at pc from the bytes fetched there (up to 4) and
// computes Beck's target address (Appendix A). PC-relative addressing uses the
// address of the next instruction, pc + length; X is a signed index. B and X
// are read through registers only when the addressing mode needs them.
//
// Throws IllegalInstruction for an unknown opcode or an addressing-bit
// combination outside Appendix A, and AddressOutOfRange when the instruction
// is cut off by the end of memory or its target address falls outside memory.
// An immediate TA is data rather than an address, so it only wraps to 24 bits.
DecodedInstruction decode(const InstructionSet& set,
                          const std::vector<byte_t>& bytes,
                          std::uint32_t pc,
                          RegisterAccessor& registers);

} // namespace sicxe
