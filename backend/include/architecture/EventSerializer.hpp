#pragma once

#include "architecture/ExecutionEvent.hpp"

#include <nlohmann/json.hpp>

namespace EventSerializer {

inline nlohmann::json serialize(
    const InstructionFetched& event
)
{
    return {
        {"type", "instruction_fetched"},
        {"address", event.address},
        {"value", event.value}
    };
}

inline nlohmann::json serialize(
    const InstructionExecuted& event
)
{
    return {
        {"type", "instruction_executed"},
        {"instruction", {
            {"id", event.instruction->id},
            {"mnemonic", event.instruction->mnemonic},
            {"opcode", event.instruction->opcode},
            {"formats",
                static_cast<std::uint8_t>(
                    event.instruction->formats
                )
            },
            {"operand_type",
                static_cast<std::uint8_t>(
                    event.instruction->operand_type
                )
            },
            {"flags",
                static_cast<std::uint8_t>(
                    event.instruction->flags
                )
            }
        }}
    };
}

inline nlohmann::json serialize(
    const RegisterWrite& event
)
{
    return {
        {"type", "register_write"},
        {"name", event.name},
        {"value", event.value}
    };
}

inline nlohmann::json serialize(
    const RegisterRead& event
)
{
    return {
        {"type", "register_read"},
        {"name", event.name},
        {"value", event.value}
    };
}

inline nlohmann::json serialize(
    const MemoryWrite& event
)
{
    return {
        {"type", "memory_write"},
        {"address", event.address},
        {"value", event.value}
    };
}

inline nlohmann::json serialize(
    const MemoryRead& event
)
{
    return {
        {"type", "memory_read"},
        {"address", event.address},
        {"value", event.value}
    };
}

inline nlohmann::json serialize(
    const ExecutionEvent& event
)
{
    return std::visit(
        [](const auto& value) {
            return serialize(value);
        },
        event
    );
}

inline nlohmann::json serialize(
    const std::vector<ExecutionEvent>& events
)
{
    nlohmann::json result = nlohmann::json::array();

    for (const auto& event : events) {
        result.push_back(serialize(event));
    }

    return result;
}

}