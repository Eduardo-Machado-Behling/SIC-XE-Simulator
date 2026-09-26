// 24-bit words (Beck 1.3.1: integers are 24-bit, 2's complement) and the condition code.

#include "ConditionCode.hpp"
#include "TestSupport.hpp"
#include "Word.hpp"

namespace {

void wordsWrapAt24Bits() {
    test("toWord keeps the low 24 bits", [] {
        checkHex("0x123456", sicxe::toWord(0x123456), 0x123456);
        checkHex("0x1000000", sicxe::toWord(0x1000000), 0x000000);
        checkHex("-1", sicxe::toWord(-1), 0xFFFFFF);
    });

    test("toSigned reads a word as 2's complement", [] {
        check("FFFFFF is -1", sicxe::toSigned(0xFFFFFF) == -1);
        check("800000 is -8388608", sicxe::toSigned(0x800000) == -8388608);
        check("7FFFFF is 8388607", sicxe::toSigned(0x7FFFFF) == 8388607);
        check("000005 is 5", sicxe::toSigned(0x000005) == 5);
    });
}

void compareIsSigned() {
    test("compare(-1, 1) is less: words are signed", [] {
        check("less", sicxe::compare(-1, 1) == sicxe::ConditionCode::Less);
    });
    test("compare(5, 5) is equal", [] {
        check("equal", sicxe::compare(5, 5) == sicxe::ConditionCode::Equal);
    });
    test("compare(1, -1) is greater", [] {
        check("greater", sicxe::compare(1, -1) == sicxe::ConditionCode::Greater);
    });
}

void conditionCodeLivesInSwBits6And7() {
    test("no comparison yet: CC after reset is None", [] {
        Machine machine;
        const DecodedInstruction instruction = decoded(true, true, 0);
        ExecutionContext context{machine.registerAccessor, machine.memoryAccessor, instruction};

        check("None", sicxe::getCC(context) == sicxe::ConditionCode::None);
    });

    const sicxe::ConditionCode codes[] = {
        sicxe::ConditionCode::Less, sicxe::ConditionCode::Equal, sicxe::ConditionCode::Greater};

    for (auto code : codes) {
        test("setCC round-trips and touches only SW bits 6-7 (mask 030000)", [code] {
            Machine machine;
            const DecodedInstruction instruction = decoded(true, true, 0);
            ExecutionContext context{machine.registerAccessor, machine.memoryAccessor, instruction};
            machine.registers.write("SW", 0xFFFFFF);

            sicxe::setCC(context, code);

            check("getCC returns what was set", sicxe::getCC(context) == code);
            checkHex("SW outside CC", machine.reg("SW") & ~0x030000ull, 0xFFFFFF & ~0x030000ull);
        });
    }
}

} // namespace

int main() {
    wordsWrapAt24Bits();
    compareIsSigned();
    conditionCodeLivesInSwBits6And7();
    return report();
}
