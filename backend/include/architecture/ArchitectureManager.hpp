#pragma once

#include <filesystem>
#include <string>
#include <unordered_set>

#include "architecture/IArchictecture.hpp"
#include "architecture/LoadedArchitecture.hpp"

class ArchitectureManager {
public:
    ArchitectureManager(std::filesystem::path architecturePath);

    const std::unordered_set<std::string>& ListAvailableArchitectures();
    void LoadArchitecture(const std::string& architectureId,
                          MemoryAccessor memory,
                          RegisterAccessor registerAccessor);
    IArchitecture* get() const;

private:
    std::unordered_set<std::string> m_availableArchitectures;
    LoadedArchitecture m_currentArchitecture;
    std::filesystem::path m_architecturePath;
};