#pragma once

class RegisterAccessor;
class MemoryAccessor;
struct DecodedInstruction;

struct ExecutionContext
{
    RegisterAccessor& registers;
    MemoryAccessor& memory;
    const DecodedInstruction& instruction;
};