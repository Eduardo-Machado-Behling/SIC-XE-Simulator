#pragma once

#include <cstdint>
#include <stdexcept>
#include <vector>

#include "common/Byte.hpp"

struct Word {
    static constexpr std::uint32_t MASK = 0xFFFFFF;
    static constexpr std::uint32_t SIGN = 0x800000;

private:
    std::uint32_t content = 0;

public:
    constexpr Word() = default;

    constexpr Word(std::uint32_t value)
        : content(value & MASK) {}

    constexpr Word(std::int32_t value)
        : content(static_cast<std::uint32_t>(value) & MASK) {}

    constexpr std::uint32_t as_unsigned() const {
        return content;
    }

    std::vector<byte_t> to_bytes() const {
        return {
            static_cast<byte_t>((content >> 16) & 0xFF),
            static_cast<byte_t>((content >> 8) & 0xFF),
            static_cast<byte_t>(content & 0xFF)
        };
    }

    static Word from_bytes(const std::vector<byte_t>& bytes) {
        if (bytes.size() != 3) {
            throw std::invalid_argument("A SIC/XE Word requires exactly 3 bytes");
        }

        const std::uint32_t value =
            (static_cast<std::uint32_t>(bytes[0]) << 16) |
            (static_cast<std::uint32_t>(bytes[1]) << 8) |
            static_cast<std::uint32_t>(bytes[2]);
        return Word(value);
    }

    constexpr std::int32_t as_signed() const {
        if (content & SIGN)
            return static_cast<std::int32_t>(content | ~MASK);

        return static_cast<std::int32_t>(content);
    }

    constexpr operator std::uint32_t() const {
        return as_unsigned();
    }

    constexpr operator std::int32_t() const {
        return as_signed();
    }

    constexpr bool operator==(const Word& other) const noexcept {
        return content == other.content;
    }

    constexpr bool operator==(std::uint32_t value) const noexcept {
        return content == (value & MASK);
    }

    constexpr bool operator==(std::int32_t value) const noexcept {
        return content == (static_cast<std::uint32_t>(value) & MASK);
    }

    constexpr bool operator!=(const Word& other) const noexcept {
        return !(*this == other);
    }

    constexpr bool operator!=(std::uint32_t value) const noexcept {
        return !(*this == value);
    }

    constexpr bool operator!=(std::int32_t value) const noexcept {
        return !(*this == value);
    }

    friend constexpr bool operator==(std::uint32_t value, const Word& other) noexcept {
        return other == value;
    }

    friend constexpr bool operator==(std::int32_t value, const Word& other) noexcept {
        return other == value;
    }

    friend constexpr bool operator!=(std::uint32_t value, const Word& other) noexcept {
        return !(value == other);
    }

    friend constexpr bool operator!=(std::int32_t value, const Word& other) noexcept {
        return !(value == other);
    }
};
