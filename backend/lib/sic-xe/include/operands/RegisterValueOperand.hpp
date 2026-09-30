#pragma once

#include <cstdint>
#include "operands/Operand.hpp"
#include "essentials/RegisterID.hpp"
#include "essentials/Word.hpp"

struct RegisterValueOperand : public Operand {
	RegisterID r1;
	Word v2;
};

