#include "architecture/events/InstructionFetched.hpp"

#include <utility>

namespace architecture::events {

InstructionFetched::InstructionFetched(std::uint64_t address,
                                       std::vector<byte_t> value,
                                       std::optional<std::size_t> sourceLine,
                                       bool preview,
                                       std::optional<std::string> sourceFile)
    : address(address), value(std::move(value)), sourceLine(sourceLine), preview(preview),
      sourceFile(std::move(sourceFile)) {}

bool InstructionFetched::mutates() const noexcept { return false; }

void InstructionFetched::commit(EventState&) {}

void InstructionFetched::restore(EventState&) {}

nlohmann::json InstructionFetched::serialize() const {
    nlohmann::json event = {{"type", "InstructionFetched"},
                            {"address", address},
                            {"value", value}};
    if (sourceLine)
        event["source_line"] = *sourceLine;
    if (sourceFile)
        event["source_file"] = *sourceFile;
    if (preview)
        event["preview"] = true;
    return event;
}

} // namespace architecture::events
