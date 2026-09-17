#include "DecodedInstruction.hpp"

#include "memory/MemoryAccessor.hpp"
#include "memory/RegisterAccessor.hpp"
#include "architecture/ExecutionContext.hpp"
#include "architecture/IInstruction.hpp"

bool DecodedInstruction::execute(
    RegisterAccessor& state,
    MemoryAccessor& memory
) const
{
    if (description == nullptr) {
        return false;
    }

    if (description->implementation == nullptr) {
        return false;
    }

    ExecutionContext context{
        .registers = state,
        .memory = memory,
        .instruction = *this
    };

    return description->implementation->execute(context);
}