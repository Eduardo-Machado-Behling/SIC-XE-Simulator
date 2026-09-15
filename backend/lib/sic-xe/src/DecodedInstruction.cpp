#include "DecodedInstruction.hpp"

#include "memory/MemoryAccessor.hpp"
#include "memory/RegisterAccessor.hpp"
#include "architecture/ExecutionContext.hpp"
#include "architecture/IInstruction.hpp"

void DecodedInstruction::execute(
    RegisterAccessor& state,
    MemoryAccessor& memory
) const
{
    if (description == nullptr) {
        return;
    }

    if (description->implementation == nullptr) {
        return;
    }

    ExecutionContext context{
        .state = state,
        .memory = memory,
        .instruction = *this
    };

    description->implementation->execute(context);
}