#pragma once

#include <cstdint>

struct ExecutionContext;

// Condition code CC: bits 6-7 of SW (Beck, Appendix C), bit 0 being the leftmost
// ("the first bit, MODE", Beck 6.2.1), so CC is SW & 0x030000. Beck does not fix the codes for <, = and >; this
// simulator uses the values below, with 00 meaning no comparison yet, so no
// conditional jump is taken before the first COMP/COMPR/TIX/TIXR.
namespace sicxe {

enum class ConditionCode : std::uint8_t {
    None = 0b00,
    Less = 0b01,
    Equal = 0b10,
    Greater = 0b11,
};

// Result of comparing two signed words (COMP A:(m), COMPR r1:r2, TIX X:(m)).
ConditionCode compare(std::int32_t lhs, std::int32_t rhs);

void setCC(ExecutionContext& context, ConditionCode code);

ConditionCode getCC(ExecutionContext& context);

} // namespace sicxe
