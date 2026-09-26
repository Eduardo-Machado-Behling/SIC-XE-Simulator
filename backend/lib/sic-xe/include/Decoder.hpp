#pragma once

#include <cstdint>
#include <vector>

#include "DecodedInstruction.hpp"
#include "common/Byte.hpp"

class InstructionSet;
struct RegisterAccessor;

namespace sicxe {

// Decodes the instruction at pc from the bytes fetched there (up to 4) and
// computes Beck's target address (Appendix A). PC-relative addressing uses the
// address of the next instruction, pc + length. B and X are read through
// registers only when the addressing mode needs them.
//
// Throws IllegalInstruction for an unknown opcode or an addressing-bit
// combination outside Appendix A, and AddressOutOfRange when the instruction
// is cut off by the end of memory.
DecodedInstruction decode(const InstructionSet& set,
                          const std::vector<byte_t>& bytes,
                          std::uint32_t pc,
                          RegisterAccessor& registers);

} // namespace sicxe
