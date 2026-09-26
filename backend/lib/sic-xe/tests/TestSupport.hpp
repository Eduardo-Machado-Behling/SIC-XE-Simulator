#pragma once

#include <cstdint>
#include <cstdio>
#include <exception>
#include <functional>
#include <vector>

#include "DecodedInstruction.hpp"
#include "architecture/ExecutionContext.hpp"
#include "architecture/IInstruction.hpp"
#include "memory/Memory.hpp"
#include "memory/Registers.hpp"

// Real memory and registers behind the same accessors SICXE uses, so a test
// can run one instruction against a hand-built DecodedInstruction.
// Registers use the PDF numbering (A=0 ... SW=9), the same as SICXE.cpp.
struct Machine {
    Memory memory;
    Registers registers;
    EventQueue events;
    MemoryAccessor memoryAccessor;
    RegisterAccessor registerAccessor;

    // The accessors point at this machine's memory and registers, so a copy would alias them.
    Machine(const Machine&) = delete;
    Machine& operator=(const Machine&) = delete;

    Machine()
        : memoryAccessor(memory.getAccessor()), registerAccessor(registers.getAccessor()) {
        memory.resize(1 << 20);

        // SIC/XE register numbers (PDF, section 2).
        registers.allocate(0, "A", 0);
        registers.allocate(1, "X", 0);
        registers.allocate(2, "L", 0);
        registers.allocate(3, "B", 0);
        registers.allocate(4, "S", 0);
        registers.allocate(5, "T", 0);
        registers.allocate(6, "F", 0);
        registers.allocate(8, "PC", 0);
        registers.allocate(9, "SW", 0);

        memoryAccessor.link(&events);
        registerAccessor.link(&events);
    }

    void poke(std::uint32_t address, const std::vector<byte_t>& bytes) {
        memory.write(address, bytes);
    }

    std::vector<byte_t> peek(std::uint32_t address, std::size_t size) {
        std::vector<byte_t> bytes;
        memory.read(address, size, bytes);
        return bytes;
    }

    std::uint64_t reg(const char* name) {
        return registers.read(name);
    }

    void run(const IInstruction& instruction, const DecodedInstruction& decoded) {
        ExecutionContext context{
            .registers = registerAccessor,
            .memory = memoryAccessor,
            .instruction = decoded,
        };
        instruction.execute(context);
    }
};

// A Format 3/4 instruction as the decoder hands it over: only n, i and the
// target address matter to the operand, the other flags are already folded into TA.
inline DecodedInstruction decoded(bool n, bool i, std::uint32_t targetAddress) {
    DecodedInstruction instruction;
    instruction.format = InstructionFormat::Format3;
    instruction.n = n;
    instruction.i = i;
    instruction.target_address = targetAddress;
    return instruction;
}

inline int& failures() {
    static int count = 0;
    return count;
}

inline void checkHex(const char* what, std::uint64_t actual, std::uint64_t expected) {
    if (actual != expected) {
        std::printf("    %s: expected %06llX, got %06llX\n",
                    what,
                    static_cast<unsigned long long>(expected),
                    static_cast<unsigned long long>(actual));
        failures()++;
    }
}

inline void check(const char* what, bool condition) {
    if (!condition) {
        std::printf("    %s\n", what);
        failures()++;
    }
}

inline void test(const char* name, const std::function<void()>& body) {
    std::printf("[ RUN  ] %s\n", name);
    const int before = failures();
    try {
        body();
    } catch (const std::exception& e) {
        std::printf("    threw: %s\n", e.what());
        failures()++;
    }
    std::printf("[ %s ] %s\n", failures() == before ? " OK " : "FAIL", name);
}

inline int report() {
    if (failures() == 0) {
        std::printf("\nall tests passed\n");
        return 0;
    }
    std::printf("\n%d check(s) failed\n", failures());
    return 1;
}
