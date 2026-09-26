#include "Word.hpp"

namespace sicxe {

std::uint32_t toWord(std::int64_t value) {
    return static_cast<std::uint32_t>(value) & WORD_MASK;
}

std::int32_t toSigned(std::uint32_t word) {
    word &= WORD_MASK;

    if (word & 0x800000) {
        return static_cast<std::int32_t>(word) - 0x1000000;
    }

    return static_cast<std::int32_t>(word);
}

} // namespace sicxe
