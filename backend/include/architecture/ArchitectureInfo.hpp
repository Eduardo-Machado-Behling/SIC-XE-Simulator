#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "architecture/InstructionDescription.hpp"
#include "architecture/MemoryDescription.hpp"
#include "architecture/RegisterDescription.hpp"

struct ArchitectureInfo  {
    std::string name;
    std::string description;

    MemoryDescription memory;

    std::vector<RegisterDescription> registers;
    std::vector<InstructionDescription> instructions;
};