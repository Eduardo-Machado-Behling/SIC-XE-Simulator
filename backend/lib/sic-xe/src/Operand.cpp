#include "Operand.hpp"

#include <vector>

#include "DecodedInstruction.hpp"
#include "architecture/ExecutionContext.hpp"
#include "memory/MemoryAccessor.hpp"

namespace sicxe {
namespace {

bool isImmediate(const DecodedInstruction& instruction) {
    return !instruction.n && instruction.i;
}

bool isIndirect(const DecodedInstruction& instruction) {
    return instruction.n && !instruction.i;
}

std::uint32_t readWord(MemoryAccessor& memory, std::uint32_t address) {
    std::vector<byte_t> bytes;
    memory.read(address, 3, bytes);

    return (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
}

} // namespace

std::uint32_t operandAddress(ExecutionContext& context) {
    const DecodedInstruction& instruction = context.instruction;

    if (isIndirect(instruction)) {
        return readWord(context.memory, instruction.target_address);
    }

    return instruction.target_address;
}

std::uint32_t operandWord(ExecutionContext& context) {
    if (isImmediate(context.instruction)) {
        return context.instruction.target_address;
    }

    return readWord(context.memory, operandAddress(context));
}

std::uint8_t operandByte(ExecutionContext& context) {
    if (isImmediate(context.instruction)) {
        return context.instruction.target_address & 0xFF;
    }

    std::vector<byte_t> bytes;
    context.memory.read(operandAddress(context), 1, bytes);

    return bytes[0];
}

} // namespace sicxe
