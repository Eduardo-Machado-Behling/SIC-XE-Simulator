#include "Decoder.hpp"

#include <cstdio>
#include <string>

#include "Errors.hpp"
#include "InstructionSet.hpp"
#include "Word.hpp"
#include "memory/RegisterAccessor.hpp"

namespace sicxe {
namespace {

std::string at(std::uint32_t pc) {
    char text[16];
    std::snprintf(text, sizeof text, " at %06X", pc);
    return text;
}

void requireBytes(const std::vector<byte_t>& bytes, std::size_t length, std::uint32_t pc) {
    if (bytes.size() < length) {
        throw AddressOutOfRange("instruction runs past the end of memory" + at(pc));
    }
}

// PC-relative displacements are 12-bit 2's complement (-2048..2047).
std::int32_t signExtend12(std::int32_t disp) {
    return (disp & 0x800) ? disp - 0x1000 : disp;
}

// The n i x b p e combinations Appendix A lists for Format 3/4 with n or i set:
// b and p exclusive, neither with e, and indexing only with simple addressing.
bool isLegalAddressing(const DecodedInstruction& instruction) {
    if (instruction.b && instruction.p) {
        return false;
    }

    if (instruction.e && (instruction.b || instruction.p)) {
        return false;
    }

    return !instruction.x || instruction.n == instruction.i;
}

} // namespace

DecodedInstruction decode(const InstructionSet& set,
                          const std::vector<byte_t>& bytes,
                          std::uint32_t pc,
                          RegisterAccessor& registers) {
    requireBytes(bytes, 1, pc);

    const std::uint8_t byte1 = bytes[0];
    const InstructionDescription* description = set.findByOpcode(byte1 & 0xFC);

    if (description == nullptr) {
        throw IllegalInstruction("unknown opcode" + at(pc));
    }

    DecodedInstruction instruction;
    instruction.description = description;
    instruction.address = pc;

    const bool format1 = hasFormat(description->formats, InstructionFormat::Format1);
    const bool format2 = hasFormat(description->formats, InstructionFormat::Format2);

    if (format1 || format2) {
        // Formats 1 and 2 use all 8 bits as the opcode, so the low two bits must match too.
        if ((byte1 & 0x03) != 0) {
            throw IllegalInstruction("unknown opcode" + at(pc));
        }

        if (format1) {
            instruction.format = InstructionFormat::Format1;
            instruction.length = 1;
            return instruction;
        }

        requireBytes(bytes, 2, pc);
        instruction.format = InstructionFormat::Format2;
        instruction.length = 2;
        instruction.r1 = (bytes[1] >> 4) & 0x0F;
        instruction.r2 = bytes[1] & 0x0F;
        return instruction;
    }

    requireBytes(bytes, 3, pc);

    const std::uint8_t byte2 = bytes[1];
    const std::uint8_t byte3 = bytes[2];

    instruction.n = (byte1 & 0x02) != 0;
    instruction.i = (byte1 & 0x01) != 0;
    instruction.x = (byte2 & 0x80) != 0;

    std::int64_t target = 0;

    if (!instruction.n && !instruction.i) {
        // SIC (Beck 1.3.2): with n = i = 0, bits b, p and e belong to a 15-bit address.
        instruction.format = InstructionFormat::Format3;
        instruction.length = 3;
        instruction.displacement = ((byte2 & 0x7F) << 8) | byte3;
        target = instruction.displacement;
    } else {
        instruction.b = (byte2 & 0x40) != 0;
        instruction.p = (byte2 & 0x20) != 0;
        instruction.e = (byte2 & 0x10) != 0;

        if (!isLegalAddressing(instruction)) {
            throw IllegalInstruction("addressing flags not in Appendix A" + at(pc));
        }

        if (instruction.e) {
            requireBytes(bytes, 4, pc);
            instruction.format = InstructionFormat::Format4;
            instruction.length = 4;
            instruction.displacement = ((byte2 & 0x0F) << 16) | (byte3 << 8) | bytes[3];
            target = instruction.displacement;
        } else {
            instruction.format = InstructionFormat::Format3;
            instruction.length = 3;
            instruction.displacement = ((byte2 & 0x0F) << 8) | byte3;

            if (instruction.p) {
                target = static_cast<std::int64_t>(pc) + instruction.length + signExtend12(instruction.displacement);
            } else if (instruction.b) {
                target = static_cast<std::int64_t>(registers.read("B")) + instruction.displacement;
            } else {
                target = instruction.displacement;
            }
        }
    }

    if (instruction.x) {
        target += static_cast<std::int64_t>(registers.read("X"));
    }

    instruction.target_address = toWord(target);

    if (!instruction.n && instruction.i) {
        instruction.immediate = static_cast<std::int32_t>(instruction.target_address);
    }

    return instruction;
}

} // namespace sicxe
