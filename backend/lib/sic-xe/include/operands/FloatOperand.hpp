#pragma once

#include "operands/Operand.hpp"
#include "essentials/Float.hpp"

struct FloatOperand : public Operand {
	Float value;
};

