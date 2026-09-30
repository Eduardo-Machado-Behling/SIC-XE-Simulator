#pragma once

#include <cstdint>
#include <stdexcept>
#include <vector>

#include "common/Byte.hpp"

using RegisterID = std::uint8_t;

inline std::vector<byte_t> to_bytes(RegisterID register_id) {
    return {static_cast<byte_t>(register_id)};
}

inline RegisterID from_bytes(const std::vector<byte_t>& bytes) {
    if (bytes.size() != 1) {
        throw std::invalid_argument("A register identifier requires exactly 1 byte");
    }
    return static_cast<RegisterID>(bytes.front());
}
