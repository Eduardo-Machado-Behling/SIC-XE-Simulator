// Instruction decoding and target-address calculation (Beck 1.3.2, Appendix A).

#include <string>
#include <vector>

#include "Decoder.hpp"
#include "Errors.hpp"
#include "InstructionSet.hpp"
#include "TestSupport.hpp"

namespace {

const InstructionSet SET;

DecodedInstruction decodeAt(Machine& machine, std::uint32_t pc, const std::vector<byte_t>& bytes) {
    return sicxe::decode(SET, bytes, pc, machine.registerAccessor);
}

struct TargetCase {
    const char* name;
    std::vector<byte_t> bytes;
    std::uint32_t pc;
    std::uint64_t b;
    std::uint64_t x;
    std::uint32_t targetAddress;
    std::uint8_t length;
};

// Beck, Fig. 1.1: (B)=006000, (X)=000090 and (PC)=003000 once the instruction is fetched,
// so a format 3 instruction sits at 2FFD and a format 4 one at 2FFC.
const TargetCase TARGETS[] = {
    {"032600 PC-relative", {0x03, 0x26, 0x00}, 0x2FFD, 0x6000, 0x90, 0x3600, 3},
    {"03C300 base-relative + index", {0x03, 0xC3, 0x00}, 0x2FFD, 0x6000, 0x90, 0x6390, 3},
    {"022030 indirect, PC-relative", {0x02, 0x20, 0x30}, 0x2FFD, 0x6000, 0x90, 0x3030, 3},
    {"010030 immediate", {0x01, 0x00, 0x30}, 0x2FFD, 0x6000, 0x90, 0x0030, 3},
    {"003600 SIC: b/p/e are address bits", {0x00, 0x36, 0x00}, 0x2FFD, 0x6000, 0x90, 0x3600, 3},
    {"0310C303 format 4", {0x03, 0x10, 0xC3, 0x03}, 0x2FFC, 0x6000, 0x90, 0xC303, 4},

    {"PC-relative disp is signed: 032FFD at 0100", {0x03, 0x2F, 0xFD}, 0x0100, 0, 0, 0x0100, 3},
    {"base-relative disp is unsigned: 034FFF", {0x03, 0x4F, 0xFF}, 0x0000, 0x1000, 0, 0x1FFF, 3},
    {"SIC + index: 00B600", {0x00, 0xB6, 0x00}, 0x0000, 0, 0x90, 0x3690, 3},
    {"format 4 + index: 0390C303", {0x03, 0x90, 0xC3, 0x03}, 0x0000, 0, 0x90, 0xC393, 4},
    {"immediate PC-relative: 012010 at 0100", {0x01, 0x20, 0x10}, 0x0100, 0, 0, 0x0113, 3},
    {"indirect base-relative: 024010", {0x02, 0x40, 0x10}, 0x0000, 0x6000, 0, 0x6010, 3},
    {"TA wraps to 24 bits: 014001 with B=FFFFFF", {0x01, 0x40, 0x01}, 0x0000, 0xFFFFFF, 0, 0x0000, 3},
};

void targetAddressFollowsAppendixA() {
    for (const auto& c : TARGETS) {
        test(c.name, [&] {
            Machine machine;
            machine.registers.write("B", c.b);
            machine.registers.write("X", c.x);

            const DecodedInstruction decoded = decodeAt(machine, c.pc, c.bytes);

            checkHex("TA", decoded.target_address, c.targetAddress);
            checkHex("length", decoded.length, c.length);
        });
    }
}

void flagsSelectTheOperandMode() {
    test("022030 decodes as indirect (n=1, i=0)", [] {
        Machine machine;
        const DecodedInstruction decoded = decodeAt(machine, 0, {0x02, 0x20, 0x30});
        check("n", decoded.n);
        check("i", !decoded.i);
    });

    test("010030 decodes as immediate (n=0, i=1)", [] {
        Machine machine;
        const DecodedInstruction decoded = decodeAt(machine, 0, {0x01, 0x00, 0x30});
        check("n", !decoded.n);
        check("i", decoded.i);
    });

    test("immediate keeps the legacy .immediate field equal to TA (read by ADD)", [] {
        Machine machine;
        const DecodedInstruction decoded = decodeAt(machine, 0x0100, {0x01, 0x20, 0x10});
        checkHex("immediate", static_cast<std::uint32_t>(decoded.immediate), 0x0113);
    });

    test("0310C303 decodes as format 4 LDA", [] {
        Machine machine;
        const DecodedInstruction decoded = decodeAt(machine, 0, {0x03, 0x10, 0xC3, 0x03});
        check("format 4", decoded.format == InstructionFormat::Format4);
        check("LDA", decoded.description != nullptr && decoded.description->mnemonic == "LDA");
    });
}

void registerFormatsAreShort() {
    test("C4 (FIX) is format 1: one byte", [] {
        Machine machine;
        const DecodedInstruction decoded = decodeAt(machine, 0, {0xC4, 0xFF, 0xFF, 0xFF});
        check("format 1", decoded.format == InstructionFormat::Format1);
        checkHex("length", decoded.length, 1);
    });

    test("B410 (CLEAR X) is format 2: two bytes, r1 = 1", [] {
        Machine machine;
        const DecodedInstruction decoded = decodeAt(machine, 0, {0xB4, 0x10, 0xFF, 0xFF});
        check("format 2", decoded.format == InstructionFormat::Format2);
        checkHex("length", decoded.length, 2);
        checkHex("r1", decoded.r1, 1);
        checkHex("r2", decoded.r2, 0);
    });

    test("A045 (COMPR S,T) carries r1 = 4, r2 = 5", [] {
        Machine machine;
        const DecodedInstruction decoded = decodeAt(machine, 0, {0xA0, 0x45});
        checkHex("r1", decoded.r1, 4);
        checkHex("r2", decoded.r2, 5);
    });
}

struct RejectedCase {
    const char* name;
    std::vector<byte_t> bytes;
};

// Appendix A: "Combinations of addressing bits not included in this table are treated as errors".
const RejectedCase ILLEGAL[] = {
    {"b and p both set: 036000", {0x03, 0x60, 0x00}},
    {"format 4 with p: 03300000", {0x03, 0x30, 0x00, 0x00}},
    {"format 4 with b: 03500000", {0x03, 0x50, 0x00, 0x00}},
    {"index with immediate: 018000", {0x01, 0x80, 0x00}},
    {"index with indirect: 028000", {0x02, 0x80, 0x00}},
    {"unknown opcode: FC0000", {0xFC, 0x00, 0x00}},
    {"format 2 opcode with n/i bits: 9100", {0x91, 0x00}},
};

void illegalInstructionsAreRejected() {
    for (const auto& c : ILLEGAL) {
        test(c.name, [&] {
            Machine machine;
            bool rejected = false;
            try {
                decodeAt(machine, 0, c.bytes);
            } catch (const sicxe::IllegalInstruction&) {
                rejected = true;
            }
            check("expected IllegalInstruction", rejected);
        });
    }
}

const RejectedCase TRUNCATED[] = {
    {"format 3 with only 2 bytes left in memory", {0x03, 0x20}},
    {"format 4 with only 3 bytes left in memory", {0x03, 0x10, 0xC3}},
    {"format 2 with only 1 byte left in memory", {0xB4}},
};

void instructionsCutByTheEndOfMemoryAreRejected() {
    for (const auto& c : TRUNCATED) {
        test(c.name, [&] {
            Machine machine;
            bool rejected = false;
            try {
                decodeAt(machine, 0, c.bytes);
            } catch (const sicxe::AddressOutOfRange&) {
                rejected = true;
            }
            check("expected AddressOutOfRange", rejected);
        });
    }
}

} // namespace

int main() {
    targetAddressFollowsAppendixA();
    flagsSelectTheOperandMode();
    registerFormatsAreShort();
    illegalInstructionsAreRejected();
    instructionsCutByTheEndOfMemoryAreRejected();
    return report();
}
