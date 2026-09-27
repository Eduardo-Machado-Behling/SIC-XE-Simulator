#pragma once

class RegisterAccessor;
class MemoryAccessor;

struct ExecutionContext
{
    RegisterAccessor& registers;
    MemoryAccessor& memory;
};
