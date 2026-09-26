// Load instructions: #12 LDA, #13 LDB, #14 LDCH, #15 LDL, #17 LDT, #18 LDX.
//
// Each case hands the instruction an already-decoded target address (TA), the
// way the decoder is expected to, so the loads are checked on their own.
// Expected values are Beck, Figure 1.1.

#include <string>

#include "Instructions.hpp"
#include "TestSupport.hpp"

namespace {

// Beck, Fig. 1.1(a). SIC/XE words are big-endian: the MSB sits at the lowest address.
void loadFigure11Memory(Machine& machine) {
    machine.poke(0x3030, {0x00, 0x36, 0x00});
    machine.poke(0x3600, {0x10, 0x30, 0x00});
    machine.poke(0x6390, {0x00, 0xC3, 0x03});
    machine.poke(0xC303, {0x00, 0x30, 0x30});
}

struct Figure11Case {
    const char* instruction;
    bool n;
    bool i;
    std::uint32_t targetAddress;
    std::uint64_t loaded;
};

// Beck, Fig. 1.1(b): machine code, n/i bits, target address, value loaded.
const Figure11Case FIGURE_11[] = {
    {"032600 simple, PC-relative", true, true, 0x3600, 0x103000},
    {"03C300 simple, base + index", true, true, 0x6390, 0x00C303},
    {"022030 indirect", true, false, 0x3030, 0x103000},
    {"010030 immediate", false, true, 0x0030, 0x000030},
    {"003600 SIC simple", false, false, 0x3600, 0x103000},
    {"0310C303 format 4", true, true, 0xC303, 0x003030},
};

struct WordLoad {
    const char* mnemonic;
    const IInstruction& instruction;
    const char* reg;
};

const LdaInstruction LDA;
const LdbInstruction LDB;
const LdchInstruction LDCH;
const LdlInstruction LDL;
const LdtInstruction LDT;
const LdxInstruction LDX;

const WordLoad WORD_LOADS[] = {
    {"LDA", LDA, "A"},
    {"LDB", LDB, "B"},
    {"LDL", LDL, "L"},
    {"LDT", LDT, "T"},
    {"LDX", LDX, "X"},
};

const char* const ALL_REGISTERS[] = {"A", "X", "L", "B", "S", "T", "SW"};
constexpr std::uint64_t UNTOUCHED = 0xABCDEF;

void wordLoadsFollowFigure11() {
    for (const auto& load : WORD_LOADS) {
        for (const auto& c : FIGURE_11) {
            char name[96];
            std::snprintf(name, sizeof name, "%s %s -> %s = %06llX", load.mnemonic, c.instruction,
                          load.reg, static_cast<unsigned long long>(c.loaded));

            test(name, [&] {
                Machine machine;
                loadFigure11Memory(machine);

                const bool advancePc = machine.run(load.instruction, decoded(c.n, c.i, c.targetAddress));

                checkHex(load.reg, machine.reg(load.reg), c.loaded);
                check("execute must return true so step() advances PC", advancePc);
            });
        }
    }
}

void wordLoadsWriteOnlyTheirRegister() {
    for (const auto& load : WORD_LOADS) {
        char name[64];
        std::snprintf(name, sizeof name, "%s leaves every other register untouched", load.mnemonic);

        test(name, [&] {
            Machine machine;
            loadFigure11Memory(machine);
            for (const char* r : ALL_REGISTERS) {
                machine.registers.write(r, UNTOUCHED);
            }

            machine.run(load.instruction, decoded(true, true, 0x3600));

            for (const char* r : ALL_REGISTERS) {
                checkHex(r, machine.reg(r), r == std::string(load.reg) ? 0x103000 : UNTOUCHED);
            }
        });
    }
}

struct CharLoadCase {
    const char* name;
    bool n;
    bool i;
    std::uint32_t targetAddress;
    std::uint64_t a;
};

// A starts as 123456; only its rightmost byte may change.
const CharLoadCase LDCH_CASES[] = {
    {"LDCH simple loads the byte at TA", true, true, 0x3600, 0x123410},
    {"LDCH SIC simple loads the byte at TA", false, false, 0x3601, 0x123430},
    {"LDCH immediate loads the low byte of TA", false, true, 0x005A, 0x12345A},
    {"LDCH indirect loads the byte at (TA)", true, false, 0x3030, 0x123410},
};

void ldchReplacesOnlyTheRightmostByteOfA() {
    for (const auto& c : LDCH_CASES) {
        test(c.name, [&] {
            Machine machine;
            loadFigure11Memory(machine);
            machine.registers.write("A", 0x123456);
            machine.registers.write("X", UNTOUCHED);

            const bool advancePc = machine.run(LDCH, decoded(c.n, c.i, c.targetAddress));

            checkHex("A", machine.reg("A"), c.a);
            checkHex("X", machine.reg("X"), UNTOUCHED);
            check("execute must return true so step() advances PC", advancePc);
        });
    }
}

// Operands wider than Fig. 1.1 reaches: 20-bit immediates (format 4) and
// pointers above 0xFFFF, where truncation or byte-order bugs show up.
void operandsUseTheirFullWidth() {
    test("LDT #4096 (Beck: +LDT #4096 = 75101000) -> T = 001000", [] {
        Machine machine;

        machine.run(LDT, decoded(false, true, 0x01000));

        checkHex("T", machine.reg("T"), 0x001000);
    });

    test("LDA immediate keeps all 20 bits of TA -> A = 0ABCDE", [] {
        Machine machine;

        machine.run(LDA, decoded(false, true, 0xABCDE));

        checkHex("A", machine.reg("A"), 0x0ABCDE);
    });

    test("LDA indirect follows a pointer above 0xFFFF -> A = ABCDEF", [] {
        Machine machine;
        machine.poke(0x00400, {0x01, 0x23, 0x45});
        machine.poke(0x12345, {0xAB, 0xCD, 0xEF});

        machine.run(LDA, decoded(true, false, 0x00400));

        checkHex("A", machine.reg("A"), 0xABCDEF);
    });

    test("LDCH reads a single byte, even the last one in memory", [] {
        Machine machine;
        machine.poke(0xFFFFF, {0x7E});
        machine.registers.write("A", 0x123456);

        machine.run(LDCH, decoded(true, true, 0xFFFFF));

        checkHex("A", machine.reg("A"), 0x12347E);
    });
}

} // namespace

int main() {
    wordLoadsFollowFigure11();
    wordLoadsWriteOnlyTheirRegister();
    ldchReplacesOnlyTheRightmostByteOfA();
    operandsUseTheirFullWidth();
    return report();
}
