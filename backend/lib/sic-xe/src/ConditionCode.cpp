#include "ConditionCode.hpp"

#include "architecture/ExecutionContext.hpp"
#include "memory/RegisterAccessor.hpp"

namespace sicxe {
namespace {

constexpr std::uint64_t CC_SHIFT = 16;
constexpr std::uint64_t CC_MASK = 0b11ull << CC_SHIFT;

} // namespace

ConditionCode compare(std::int32_t lhs, std::int32_t rhs) {
    if (lhs < rhs) {
        return ConditionCode::Less;
    }

    if (lhs > rhs) {
        return ConditionCode::Greater;
    }

    return ConditionCode::Equal;
}

void setCC(ExecutionContext& context, ConditionCode code) {
    const std::uint64_t sw = context.registers.read("SW");

    context.registers.write("SW", (sw & ~CC_MASK) | (static_cast<std::uint64_t>(code) << CC_SHIFT));
}

ConditionCode getCC(ExecutionContext& context) {
    return static_cast<ConditionCode>((context.registers.read("SW") & CC_MASK) >> CC_SHIFT);
}

} // namespace sicxe
