// SICXE::step end to end: fetch, decode, PC update and execute, on a machine
// wired the way Simulator::load_project wires it.

#include <cstdio>
#include <string>
#include <variant>
#include <vector>

#include "SICXE.hpp"
#include "TestSupport.hpp"

namespace {

struct Computer {
    Memory memory;
    Registers registers;
    SICXE cpu;

    Computer(const Computer&) = delete;
    Computer& operator=(const Computer&) = delete;

    Computer()
        : cpu(memory.getAccessor(), registers.getAccessor()) {
        memory.resize(cpu.info().memory.address_space_size);
        for (const auto& reg : cpu.info().registers) {
            registers.allocate(reg.id, reg.name, 0);
        }
        cpu.reset();
    }

    void poke(std::uint32_t address, const std::vector<byte_t>& bytes) {
        memory.write(address, bytes);
    }

    std::uint64_t reg(const char* name) {
        return registers.read(name);
    }
};

struct Figure11Step {
    const char* name;
    std::uint32_t at;
    std::vector<byte_t> instruction;
    std::uint64_t loaded;
};

// Beck, Fig. 1.1(b), each LDA placed so that (PC) = 003000 while it executes.
const Figure11Step FIGURE_11[] = {
    {"032600 PC-relative", 0x2FFD, {0x03, 0x26, 0x00}, 0x103000},
    {"03C300 base-relative + index", 0x2FFD, {0x03, 0xC3, 0x00}, 0x00C303},
    {"022030 indirect", 0x2FFD, {0x02, 0x20, 0x30}, 0x103000},
    {"010030 immediate", 0x2FFD, {0x01, 0x00, 0x30}, 0x000030},
    {"003600 SIC", 0x2FFD, {0x00, 0x36, 0x00}, 0x103000},
    {"0310C303 format 4", 0x2FFC, {0x03, 0x10, 0xC3, 0x03}, 0x003030},
};

void ldaRunsBecksFigure11() {
    for (const auto& c : FIGURE_11) {
        std::string name = std::string("step LDA ") + c.name;

        test(name.c_str(), [&] {
            Computer computer;
            computer.poke(0x3030, {0x00, 0x36, 0x00});
            computer.poke(0x3600, {0x10, 0x30, 0x00});
            computer.poke(0x6390, {0x00, 0xC3, 0x03});
            computer.poke(0xC303, {0x00, 0x30, 0x30});
            computer.registers.write("B", 0x006000);
            computer.registers.write("X", 0x000090);
            computer.poke(c.at, c.instruction);
            computer.registers.write("PC", c.at);

            computer.cpu.step();

            checkHex("A", computer.reg("A"), c.loaded);
            checkHex("PC", computer.reg("PC"), 0x003000);
        });
    }
}

std::string describe(const RegisterWrite& write) {
    char text[32];
    std::snprintf(text, sizeof text, "%s=%06llX", write.name.c_str(), static_cast<unsigned long long>(write.value));
    return text;
}

// Beck 1.3.1: while an instruction executes, PC already holds the next address.
void pcIsAdvancedBeforeTheInstructionRuns() {
    test("step writes PC = next address before LDA #7 writes A", [] {
        Computer computer;
        computer.poke(0x0100, {0x01, 0x00, 0x07});
        computer.registers.write("PC", 0x0100);
        computer.cpu.consume_events();

        computer.cpu.step();

        std::vector<std::string> writes;
        bool executedLast = false;
        for (const auto& event : computer.cpu.consume_events()) {
            if (const auto* write = std::get_if<RegisterWrite>(&event)) {
                writes.push_back(describe(*write));
            }
            executedLast = std::holds_alternative<InstructionExecuted>(event);
        }

        check("register writes are PC=000103 then A=000007",
              writes == std::vector<std::string>{"PC=000103", "A=000007"});
        check("InstructionExecuted is the last event", executedLast);
    });
}

void aFailingInstructionLeavesPcOnIt() {
    test("FIX (not supported) throws and PC stays on it", [] {
        Computer computer;
        computer.poke(0x0200, {0xC4});
        computer.registers.write("PC", 0x0200);

        bool threw = false;
        try {
            computer.cpu.step();
        } catch (const std::exception&) {
            threw = true;
        }

        check("step must throw", threw);
        checkHex("PC", computer.reg("PC"), 0x0200);
    });
}

void theLastInstructionInMemoryRuns() {
    test("LDA in the last 3 bytes of memory does not read past the end", [] {
        Computer computer;
        const std::uint32_t last = static_cast<std::uint32_t>(computer.cpu.info().memory.address_space_size) - 3;
        computer.poke(0x000000, {0x12, 0x34, 0x56});
        computer.poke(last, {0x03, 0x00, 0x00});
        computer.registers.write("PC", last);

        computer.cpu.step();

        checkHex("A", computer.reg("A"), 0x123456);
    });
}

struct RegisterNumber {
    std::uint8_t number;
    const char* name;
};

// Beck 1.3.1/1.3.2 and the PDF, section 2: what Format 2 r1/r2 refer to.
const RegisterNumber NUMBERS[] = {
    {0, "A"}, {1, "X"}, {2, "L"}, {3, "B"}, {4, "S"}, {5, "T"}, {6, "F"}, {8, "PC"}, {9, "SW"},
};

void registerNumbersMatchSicXe() {
    test("register numbers 0-6, 8, 9 reach A, X, L, B, S, T, F, PC, SW", [] {
        Computer computer;
        for (const auto& r : NUMBERS) {
            computer.registers.write(r.name, 0x100 + r.number);
        }

        for (const auto& r : NUMBERS) {
            checkHex(r.name, computer.registers.read(r.number), 0x100 + r.number);
        }
    });
}

} // namespace

int main() {
    ldaRunsBecksFigure11();
    pcIsAdvancedBeforeTheInstructionRuns();
    aFailingInstructionLeavesPcOnIt();
    theLastInstructionInMemoryRuns();
    registerNumbersMatchSicXe();
    return report();
}
