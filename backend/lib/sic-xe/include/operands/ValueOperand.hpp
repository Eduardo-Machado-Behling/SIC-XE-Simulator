#pragma once

#include <cstdint>

#include "operands/Operand.hpp"
#include "essentials/Word.hpp"

struct ValueOperand : public Operand {
	Word value;
};
