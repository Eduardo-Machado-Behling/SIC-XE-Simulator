#pragma once

#include <stdexcept>

// Machine errors, named after Beck's program interrupt codes (Appendix C).
namespace sicxe {

// Code 00: unknown opcode or an addressing-bit combination outside Appendix A.
struct IllegalInstruction : std::runtime_error {
    using std::runtime_error::runtime_error;
};

// Code 02: an instruction that runs past the end of memory. (Operand accesses
// out of range are reported by Memory as MemoryOutOfBoundsException.)
struct AddressOutOfRange : std::runtime_error {
    using std::runtime_error::runtime_error;
};

} // namespace sicxe
