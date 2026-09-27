#pragma once

#include <cstdint>
#include "operands/Operand.hpp"

struct RegisterOperand : public Operand {
	std::uint64_t r1;
};
