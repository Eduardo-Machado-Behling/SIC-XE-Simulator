#pragma once

#include <cstdint>

#include "operands/Operand.hpp"
#include "essentials/RegisterID.hpp"

struct RegistersOperand : public Operand {
	RegisterID r1;
	RegisterID r2;
};
