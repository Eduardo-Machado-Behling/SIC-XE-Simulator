#pragma once

#include <cstdint>
#include "operands/Operand.hpp"

struct AddressOperand : public Operand {
	std::uint64_t address;
};
