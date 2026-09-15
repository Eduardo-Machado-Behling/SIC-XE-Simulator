#include "architecture/ExecutionContext.hpp"

class IInstruction
{
public:
    virtual ~IInstruction() = default;

    virtual void execute(
        ExecutionContext& context
    ) const = 0;
};