#include "Instructions.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

#include "DecodedInstruction.hpp"
#include "memory/MemoryAccessor.hpp"
#include "memory/RegisterAccessor.hpp"
#include "operands/AddressOperand.hpp"
#include "operands/NoneOperand.hpp"
#include "operands/RegisterOperand.hpp"
#include "operands/RegisterValueOperand.hpp"
#include "operands/RegistersOperand.hpp"
#include "operands/ValueOperand.hpp"

namespace {

constexpr std::uint32_t WORD_MASK = 0xFFFFFF;
constexpr std::uint8_t CC_MASK = 0xC0;
constexpr std::uint8_t CC_LESS = 0x00;
constexpr std::uint8_t CC_EQUAL = 0x40;
constexpr std::uint8_t CC_GREATER = 0x80;

Word read_register(RegisterAccessor& registers, const char* name) {
    return Word::from_bytes(registers.read(name));
}

void write_register(RegisterAccessor& registers, const char* name, Word value) {
    registers.write(name, value.to_bytes());
}

const char* register_name(RegisterID id) {
    switch (id) {
        case 0: return "A";
        case 1: return "X";
        case 2: return "L";
        case 3: return "B";
        case 4: return "S";
        case 5: return "T";
        case 6: return "F";
        case 8: return "PC";
        case 9: return "SW";
        default: throw std::invalid_argument("Invalid or unsupported SIC/XE register number");
    }
}

Word read_register(RegisterAccessor& registers, RegisterID id) {
    return read_register(registers, register_name(id));
}

void write_register(RegisterAccessor& registers, RegisterID id, Word value) {
    write_register(registers, register_name(id), value);
}

void set_condition_code(RegisterAccessor& registers, std::uint8_t code) {
    auto status = registers.read("SW");
    status[0] = static_cast<byte_t>((status[0] & ~CC_MASK) | code);
    registers.write("SW", status);
}

std::uint8_t condition_code(RegisterAccessor& registers) {
    return static_cast<std::uint8_t>(registers.read("SW")[0] & CC_MASK);
}

void compare(RegisterAccessor& registers, Word lhs, Word rhs) {
    const auto left = lhs.as_signed();
    const auto right = rhs.as_signed();
    set_condition_code(registers, left < right ? CC_LESS : left > right ? CC_GREATER : CC_EQUAL);
}

void store_register(MemoryAccessor& memory,
                    RegisterAccessor& registers,
                    Word address,
                    const char* name) {
    memory.write(address.as_unsigned(), registers.read(name));
}

void store_byte(MemoryAccessor& memory, Word address, byte_t value) {
    memory.write(address.as_unsigned(), std::vector<byte_t>{value});
}

Word incremented(Word value) {
    return Word((value.as_unsigned() + 1) & WORD_MASK);
}

} // namespace

#define DEFINE_UNIMPLEMENTED_INSTRUCTION(__name, __operand)                                        \
    bool __name::execute(ExecutionContext&, __operand) const {                                    \
        throw UnimplementedInstruction(#__name);                                                   \
    }

bool AddInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    const auto lhs = read_register(context.registers, "A").as_signed();
    write_register(context.registers, "A", Word(lhs + operand.value.as_signed()));
    return true;
}

bool AddRInstruction::execute(ExecutionContext& context, RegistersOperand operand) const {
    const auto lhs = read_register(context.registers, operand.r2).as_signed();
    const auto rhs = read_register(context.registers, operand.r1).as_signed();
    write_register(context.registers, operand.r2, Word(lhs + rhs));
    return true;
}

bool AndInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    const auto result = read_register(context.registers, "A").as_unsigned() &
                        operand.value.as_unsigned();
    write_register(context.registers, "A", Word(result));
    return true;
}

bool ClearInstruction::execute(ExecutionContext& context, RegisterOperand operand) const {
    auto bytes = context.registers.read(register_name(operand.r1));
    std::fill(bytes.begin(), bytes.end(), 0);
    context.registers.write(register_name(operand.r1), bytes);
    return true;
}

bool CompInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    compare(context.registers, read_register(context.registers, "A"), operand.value);
    return true;
}

bool CompRInstruction::execute(ExecutionContext& context, RegistersOperand operand) const {
    compare(context.registers, read_register(context.registers, operand.r1),
            read_register(context.registers, operand.r2));
    return true;
}

bool DivInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    const auto divisor = operand.value.as_signed();
    if (divisor == 0) throw std::domain_error("SIC/XE integer division by zero");
    const auto dividend = read_register(context.registers, "A").as_signed();
    write_register(context.registers, "A", Word(dividend / divisor));
    return true;
}

bool DivRInstruction::execute(ExecutionContext& context, RegistersOperand operand) const {
    const auto divisor = read_register(context.registers, operand.r1).as_signed();
    if (divisor == 0) throw std::domain_error("SIC/XE register division by zero");
    const auto dividend = read_register(context.registers, operand.r2).as_signed();
    write_register(context.registers, operand.r2, Word(dividend / divisor));
    return true;
}

bool JInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    write_register(context.registers, "PC", operand.address);
    return true;
}

bool JeqInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    if (condition_code(context.registers) == CC_EQUAL)
        write_register(context.registers, "PC", operand.address);
    return true;
}

bool JgtInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    if (condition_code(context.registers) == CC_GREATER)
        write_register(context.registers, "PC", operand.address);
    return true;
}

bool JltInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    if (condition_code(context.registers) == CC_LESS)
        write_register(context.registers, "PC", operand.address);
    return true;
}

bool JsubInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    // DecodedInstruction advances PC before dispatch, so PC is the return address.
    write_register(context.registers, "L", read_register(context.registers, "PC"));
    write_register(context.registers, "PC", operand.address);
    return true;
}

bool LdaInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    write_register(context.registers, "A", operand.value);
    return true;
}

bool LdbInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    write_register(context.registers, "B", operand.value);
    return true;
}

bool LdchInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    auto accumulator = read_register(context.registers, "A").to_bytes();
    accumulator.back() = static_cast<byte_t>(operand.value.as_unsigned() & 0xFF);
    context.registers.write("A", accumulator);
    return true;
}

bool LdlInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    write_register(context.registers, "L", operand.value);
    return true;
}

bool LdsInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    write_register(context.registers, "S", operand.value);
    return true;
}

bool LdtInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    write_register(context.registers, "T", operand.value);
    return true;
}

bool LdxInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    write_register(context.registers, "X", operand.value);
    return true;
}

bool MulInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    const auto lhs = read_register(context.registers, "A").as_signed();
    const auto rhs = operand.value.as_signed();
    const auto result = static_cast<std::int64_t>(lhs) * rhs;
    write_register(context.registers, "A", Word(static_cast<std::uint32_t>(result)));
    return true;
}

bool MulRInstruction::execute(ExecutionContext& context, RegistersOperand operand) const {
    const auto lhs = read_register(context.registers, operand.r2).as_signed();
    const auto rhs = read_register(context.registers, operand.r1).as_signed();
    const auto result = static_cast<std::int64_t>(lhs) * rhs;
    write_register(context.registers, operand.r2, Word(static_cast<std::uint32_t>(result)));
    return true;
}

bool OrInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    const auto result = read_register(context.registers, "A").as_unsigned() |
                        operand.value.as_unsigned();
    write_register(context.registers, "A", Word(result));
    return true;
}

bool RmoInstruction::execute(ExecutionContext& context, RegistersOperand operand) const {
    const auto& source = context.registers.read(register_name(operand.r1));
    const auto& destination = context.registers.read(register_name(operand.r2));
    std::vector<byte_t> value(destination.size(), 0);
    const auto copied = std::min(source.size(), destination.size());
    std::copy(source.end() - static_cast<std::ptrdiff_t>(copied), source.end(),
              value.end() - static_cast<std::ptrdiff_t>(copied));
    context.registers.write(register_name(operand.r2), value);
    return true;
}

bool RsubInstruction::execute(ExecutionContext& context, NoneOperand) const {
    write_register(context.registers, "PC", read_register(context.registers, "L"));
    return true;
}

bool HaltInstruction::execute(ExecutionContext&, NoneOperand) const {
    // SICXE::step observes the HALT mnemonic and stops subsequent execution.
    return true;
}

bool ShiftLInstruction::execute(ExecutionContext& context, RegisterValueOperand operand) const {
    const unsigned count = static_cast<unsigned>(operand.v2.as_unsigned() & 0x0F) + 1;
    const auto value = read_register(context.registers, operand.r1).as_unsigned();
    write_register(context.registers, operand.r1, Word((value << count) & WORD_MASK));
    return true;
}

bool ShiftRInstruction::execute(ExecutionContext& context, RegisterValueOperand operand) const {
    const unsigned count = static_cast<unsigned>(operand.v2.as_unsigned() & 0x0F) + 1;
    const auto value = read_register(context.registers, operand.r1).as_signed();
    write_register(context.registers, operand.r1, Word(value >> count));
    return true;
}

bool StaInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    store_register(context.memory, context.registers, operand.address, "A");
    return true;
}

bool StbInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    store_register(context.memory, context.registers, operand.address, "B");
    return true;
}

bool StchInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    const auto bytes = context.registers.read("A");
    store_byte(context.memory, operand.address, bytes.back());
    return true;
}

bool StlInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    store_register(context.memory, context.registers, operand.address, "L");
    return true;
}

bool StsInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    store_register(context.memory, context.registers, operand.address, "S");
    return true;
}

bool SttInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    store_register(context.memory, context.registers, operand.address, "T");
    return true;
}

bool StxInstruction::execute(ExecutionContext& context, AddressOperand operand) const {
    store_register(context.memory, context.registers, operand.address, "X");
    return true;
}

bool SubInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    const auto lhs = read_register(context.registers, "A").as_signed();
    write_register(context.registers, "A", Word(lhs - operand.value.as_signed()));
    return true;
}

bool SubRInstruction::execute(ExecutionContext& context, RegistersOperand operand) const {
    const auto lhs = read_register(context.registers, operand.r2).as_signed();
    const auto rhs = read_register(context.registers, operand.r1).as_signed();
    write_register(context.registers, operand.r2, Word(lhs - rhs));
    return true;
}

bool TixInstruction::execute(ExecutionContext& context, ValueOperand operand) const {
    const auto index = incremented(read_register(context.registers, "X"));
    write_register(context.registers, "X", index);
    compare(context.registers, index, operand.value);
    return true;
}

bool TixRInstruction::execute(ExecutionContext& context, RegisterOperand operand) const {
    const auto index = incremented(read_register(context.registers, "X"));
    write_register(context.registers, "X", index);
    compare(context.registers, index, read_register(context.registers, operand.r1));
    return true;
}

DEFINE_UNIMPLEMENTED_INSTRUCTION(AddFInstruction, FloatOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(CompFInstruction, FloatOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(DivFInstruction, FloatOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(FixInstruction, NoneOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(FloatInstruction, NoneOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(HioInstruction, NoneOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(LdfInstruction, FloatOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(LpsInstruction, AddressOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(MulFInstruction, FloatOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(NormInstruction, NoneOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(RdInstruction, ValueOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(SioInstruction, NoneOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(SskInstruction, AddressOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(StfInstruction, AddressOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(StiInstruction, AddressOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(StswInstruction, AddressOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(SubFInstruction, FloatOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(TdInstruction, ValueOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(TioInstruction, NoneOperand)
DEFINE_UNIMPLEMENTED_INSTRUCTION(WdInstruction, ValueOperand)

#undef DEFINE_UNIMPLEMENTED_INSTRUCTION
