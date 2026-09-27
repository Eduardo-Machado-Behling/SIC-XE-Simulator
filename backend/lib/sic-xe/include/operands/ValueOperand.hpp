#pragma once

#include <cstdint>
#include "operands/Operand.hpp"

struct ValueOperand : public Operand {
	std::int64_t value;
};
