#pragma once

#include <cstdint>

#include "operands/Operand.hpp"
#include "essentials/Word.hpp"

struct AddressOperand : public Operand {
	Word address;
};
