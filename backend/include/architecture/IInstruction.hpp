#include "architecture/ExecutionContext.hpp"

class IInstruction {
public:
    virtual ~IInstruction() = default;

    virtual bool execute(ExecutionContext& context) const = 0;
};