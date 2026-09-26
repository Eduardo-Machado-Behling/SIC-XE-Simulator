// Writing operands: m..m+2 <- word and m <- byte (Appendix A), big-endian.

#include <vector>

#include "Errors.hpp"
#include "Operand.hpp"
#include "TestSupport.hpp"

namespace {

void storeAt(Machine& machine, const DecodedInstruction& instruction, std::uint32_t value) {
    ExecutionContext context{machine.registerAccessor, machine.memoryAccessor, instruction};
    sicxe::storeWord(context, value);
}

void storeByteAt(Machine& machine, const DecodedInstruction& instruction, std::uint8_t value) {
    ExecutionContext context{machine.registerAccessor, machine.memoryAccessor, instruction};
    sicxe::storeByte(context, value);
}

void storeWordIsBigEndian() {
    test("storeWord writes 123456 as 12 34 56 at TA", [] {
        Machine machine;

        storeAt(machine, decoded(true, true, 0x3600), 0x123456);

        check("bytes", machine.peek(0x3600, 3) == std::vector<byte_t>{0x12, 0x34, 0x56});
    });

    test("storeWord keeps only 24 bits", [] {
        Machine machine;

        storeAt(machine, decoded(true, true, 0x3600), 0xAB123456);

        check("bytes", machine.peek(0x3600, 4) == std::vector<byte_t>{0x12, 0x34, 0x56, 0x00});
    });

    test("storeWord indirect writes at (TA), not at TA", [] {
        Machine machine;
        machine.poke(0x3030, {0x00, 0x36, 0x00});

        storeAt(machine, decoded(true, false, 0x3030), 0x123456);

        check("target", machine.peek(0x3600, 3) == std::vector<byte_t>{0x12, 0x34, 0x56});
        check("pointer untouched", machine.peek(0x3030, 3) == std::vector<byte_t>{0x00, 0x36, 0x00});
    });

    test("storeWord to an immediate operand is illegal", [] {
        Machine machine;
        bool rejected = false;
        try {
            storeAt(machine, decoded(false, true, 0x3600), 0x123456);
        } catch (const sicxe::IllegalInstruction&) {
            rejected = true;
        }
        check("expected IllegalInstruction", rejected);
        check("memory untouched", machine.peek(0x3600, 3) == std::vector<byte_t>{0x00, 0x00, 0x00});
    });
}

void storeByteWritesOneByte() {
    test("storeByte changes only the byte at TA", [] {
        Machine machine;
        machine.poke(0x3600, {0x10, 0x30, 0x55, 0xAA});

        storeByteAt(machine, decoded(true, true, 0x3601), 0x7E);

        check("bytes", machine.peek(0x3600, 4) == std::vector<byte_t>{0x10, 0x7E, 0x55, 0xAA});
    });
}

} // namespace

int main() {
    storeWordIsBigEndian();
    storeByteWritesOneByte();
    return report();
}
