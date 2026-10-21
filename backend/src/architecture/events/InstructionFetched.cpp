#include "architecture/events/InstructionFetched.hpp"

#include <utility>

namespace architecture::events {

InstructionFetched::InstructionFetched(std::uint64_t address,
                                       std::vector<byte_t> value,
                                       std::optional<std::size_t> sourceLine,
                                       bool preview)
    : address(address), value(std::move(value)), sourceLine(sourceLine), preview(preview) {}

bool InstructionFetched::mutates() const noexcept { return false; }

void InstructionFetched::commit(EventState&) {}

void InstructionFetched::restore(EventState&) {}

nlohmann::json InstructionFetched::serialize() const {
    nlohmann::json event = {{"type", "InstructionFetched"},
                            {"address", address},
                            {"value", value}};
    if (sourceLine)
        event["source_line"] = *sourceLine;
    if (preview)
        event["preview"] = true;
    return event;
}

} // namespace architecture::events
