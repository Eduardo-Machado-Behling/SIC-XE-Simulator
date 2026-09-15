#pragma once

#include <cstdint>
#include <string>
#include <variant>
#include <vector>
#include <queue>

#include "architecture/InstructionDescription.hpp"
#include "common/Byte.hpp"

struct InstructionFetched {
    std::uint64_t address;
    std::vector<byte_t> value;
};

struct InstructionExecuted {
    const InstructionDescription* instruction;
};

struct RegisterWrite {
    std::string name;
    std::uint64_t value;
};

struct RegisterRead {
    std::string name;
    std::uint64_t value;
};

struct MemoryWrite {
    std::size_t address;
    std::vector<byte_t> value;
};

struct MemoryRead {
    std::size_t address;
    std::vector<byte_t> value;
};


using ExecutionEvent = std::variant<
    InstructionFetched,
    InstructionExecuted,
    RegisterWrite,
    RegisterRead,
    MemoryWrite,
    MemoryRead
>;

using EventQueue = std::queue<ExecutionEvent>;