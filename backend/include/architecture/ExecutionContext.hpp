#pragma once

class RegisterAccessor;
class MemoryAccessor;
struct DecodedInstruction;

struct ExecutionContext
{
    RegisterAccessor& state;
    MemoryAccessor& memory;
    const DecodedInstruction& instruction;
};