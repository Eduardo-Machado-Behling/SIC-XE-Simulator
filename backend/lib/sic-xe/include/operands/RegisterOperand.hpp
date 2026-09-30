#pragma once

#include <cstdint>

#include "operands/Operand.hpp"
#include "essentials/RegisterID.hpp"

struct RegisterOperand : public Operand {
	RegisterID r1;
};
