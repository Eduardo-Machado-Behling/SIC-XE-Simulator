#pragma once

#include <cstdint>
#include "operands/Operand.hpp"

struct RegistersOperand : public Operand {
	std::uint8_t r1;
	std::uint8_t r2;
};
