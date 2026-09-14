#pragma once

#include "common/byte.hpp"
#include "cstdint"

// Following Section 1.3.1 from ISBN: 9788177585551 
#define MEMORY_SIZE (1 << 20) // 1MB

struct word_t {
    byte_t bytes[3];
};

struct memory_t {
    word_t words[MEMORY_SIZE];
};


union registers_t {
    struct __regs{
        word_t A;
        word_t X;
        word_t L;
        word_t B;
        word_t S;
        word_t T;
        word_t F;

        word_t PC;
        word_t SW;
    };

    word_t R[sizeof(__regs) / sizeof(word_t)];
};

enum class AddressingMode {
    IMMEDIATE = 0,
    DIRECT,
    BASE_RELATIVE,
    PROGRAM_COUNTER_RELATIVE,
    INDEXED
};

enum class AddressingFormat {
    FORMAT_1 = 0,
    FORMAT_2,
    FORMAT_3,
    FORMAT_4,
};

struct float_t {
    uint_32_t sign: 1;
    uint_32_t exponent: 11;
    uint_32_t mantissa: 36;

    float_t(double value);
    float_t(float_t const& other);

    void operator=(double value);
    void operator=(float_t const& other);

    operator double() const;
};

struct int_t {
    int_32_t value: 24;

    int_t(double value);
    int_t(int_t const& other);

    void operator=(double value);
    void operator=(int_t const& other);

    operator int32_t() const;
};
