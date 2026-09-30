#pragma once

#include <cmath>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <vector>

#include "common/Byte.hpp"

struct Float {
    static constexpr std::uint64_t MASK = 0xFFFFFFFFFFFFULL;

    // Bit layout:
    //
    // 47              36 35                         0
    // ┌─────────────────┬───────────────────────────┐
    // │   sign (1 bit)  │ exponent (11) │ fraction  │
    // └─────────────────┴───────────────────────────┘
    //
    // Actually, because the fields occupy:
    //
    // sign     = bit 47
    // exponent = bits 46..36
    // fraction = bits 35..0

    static constexpr std::uint64_t SIGN_MASK     = 1ULL << 47;
    static constexpr std::uint64_t EXPONENT_MASK = 0x7FFULL << 36;
    static constexpr std::uint64_t FRACTION_MASK = 0xFFFFFFFFFULL;

    static constexpr int EXPONENT_BITS = 11;
    static constexpr int EXPONENT_BIAS = 1024;

private:
    std::uint64_t content = 0;

public:
    constexpr Float() = default;

    // Construct from raw 48-bit representation.
    constexpr explicit Float(std::uint64_t bits)
        : content(bits & MASK) {}

    // Construct SIC/XE float from double.
    explicit Float(double value) {
        *this = from_double(value);
    }

    // --------------------------------------------------------
    // Raw representation
    // --------------------------------------------------------

    constexpr std::uint64_t bits() const {
        return content;
    }

    std::vector<byte_t> to_bytes() const {
        return {
            static_cast<byte_t>((content >> 40) & 0xFF),
            static_cast<byte_t>((content >> 32) & 0xFF),
            static_cast<byte_t>((content >> 24) & 0xFF),
            static_cast<byte_t>((content >> 16) & 0xFF),
            static_cast<byte_t>((content >> 8) & 0xFF),
            static_cast<byte_t>(content & 0xFF)
        };
    }

    static Float from_bytes(const std::vector<byte_t>& bytes) {
        if (bytes.size() != 6) {
            throw std::invalid_argument("A SIC/XE Float requires exactly 6 bytes");
        }

        std::uint64_t bits = 0;
        for (const byte_t byte : bytes) {
            bits = (bits << 8) | static_cast<std::uint64_t>(byte);
        }
        return Float(bits);
    }

    // --------------------------------------------------------
    // Field access
    // --------------------------------------------------------

    constexpr bool sign() const {
        return (content & SIGN_MASK) != 0;
    }

    constexpr std::uint16_t exponent() const {
        return static_cast<std::uint16_t>(
            (content >> 36) & 0x7FF
        );
    }

    constexpr std::uint64_t fraction() const {
        return content & FRACTION_MASK;
    }

    double as_double() const {
        const std::uint64_t frac = fraction();
        const std::uint16_t exp = exponent();

        // SIC/XE zero is represented by all zero bits.
        if (content == 0)
            return 0.0;

        /*
         * The 36-bit fraction is interpreted as:
         *
         *     b35 b34 ... b0
         *     ↓
         *     2^-1 + 2^-2 + ... + 2^-36
         *
         * Therefore:
         *
         *     f = fraction / 2^36
         */

        const double f =
            static_cast<double>(frac) / 68719476736.0; // 2^36

        const int e =
            static_cast<int>(exp) - EXPONENT_BIAS;

        double result = std::ldexp(f, e);

        if (sign())
            result = -result;

        return result;
    }

    // Implicit Float -> double conversion.
    operator double() const {
        return as_double();
    }

    static Float from_double(double value) {
        Float result;

        if (value == 0.0)
            return result;

        if (!std::isfinite(value)) {
            throw std::domain_error(
                "SIC/XE Float cannot represent NaN or infinity"
            );
        }

        const bool negative = std::signbit(value);
        const double absolute = std::fabs(value);

        /*
         * Find e such that:
         *
         *     0.5 <= f < 1
         *
         * and:
         *
         *     value = f * 2^e
         */

        int e;
        double f = std::frexp(absolute, &e);

        /*
         * SIC/XE stores:
         *
         *     value = f * 2^(exponent - 1024)
         *
         * where f is the 36-bit fraction.
         *
         * frexp() gives:
         *
         *     absolute = f * 2^e
         *
         * Therefore:
         *
         *     exponent = e + 1024
         */

        const int stored_exponent = e + EXPONENT_BIAS;

        if (stored_exponent < 0 ||
            stored_exponent > 0x7FF) {
            throw std::overflow_error(
                "double is outside SIC/XE Float range"
            );
        }

        /*
         * Convert the fraction to its 36-bit representation.
         *
         * f is in [0.5, 1).
         *
         * SIC/XE stores:
         *
         *     fraction = f * 2^36
         */

        constexpr double FRACTION_SCALE = 68719476736.0; // 2^36

        const double scaled = f * FRACTION_SCALE;

        std::uint64_t fraction =
            static_cast<std::uint64_t>(
                std::llround(scaled)
            );

        /*
         * Rounding can produce exactly 2^36.
         *
         * That cannot fit in the 36-bit fraction, so renormalize:
         *
         *     1.000... × 2^36
         *
         * becomes:
         *
         *     0.100... × 2^37
         */

        if (fraction >= (1ULL << 36)) {
            fraction >>= 1;

            const int new_exponent =
                stored_exponent + 1;

            if (new_exponent > 0x7FF) {
                throw std::overflow_error(
                    "double is outside SIC/XE Float range"
                );
            }

            result.content =
                (negative ? SIGN_MASK : 0) |
                (static_cast<std::uint64_t>(new_exponent) << 36) |
                (fraction & FRACTION_MASK);

            return result;
        }

        result.content =
            (negative ? SIGN_MASK : 0) |
            (static_cast<std::uint64_t>(stored_exponent) << 36) |
            (fraction & FRACTION_MASK);

        return result;
    }

    operator double() {
        return as_double();
    }

    constexpr bool operator==(const Float& other) const {
        return content == other.content;
    }

    constexpr bool operator!=(const Float& other) const {
        return !(*this == other);
    }
};
