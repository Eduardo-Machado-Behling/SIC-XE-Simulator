#include "architecture/events/InstructionExecuted.hpp"

namespace architecture::events {

InstructionExecuted::InstructionExecuted(const InstructionDescription* instruction)
    : instruction(instruction) {}

bool InstructionExecuted::mutates() const noexcept { return false; }

void InstructionExecuted::commit(EventState&) {}

void InstructionExecuted::restore(EventState&) {}

nlohmann::json InstructionExecuted::serialize() const {
    if (instruction == nullptr) {
        return {{"type", "InstructionExecuted"}, {"instruction", nullptr}};
    }

    return {
        {"type", "InstructionExecuted"},
        {"instruction", {
            {"id", instruction->id},
            {"mnemonic", instruction->mnemonic},
            {"opcode", instruction->opcode},
            {"formats", static_cast<std::uint8_t>(instruction->formats)},
            {"operand_type", static_cast<std::uint8_t>(instruction->operand_type)},
            {"flags", static_cast<std::uint8_t>(instruction->flags)}
        }}
    };
}

} // namespace architecture::events
