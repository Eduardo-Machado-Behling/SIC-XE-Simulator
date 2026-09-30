#pragma once

#include <cstdint>
#include "operands/Operand.hpp"

struct RegisterValueOperand : public Operand {
	std::uint64_t r1;
	std::uint64_t v2;
};

