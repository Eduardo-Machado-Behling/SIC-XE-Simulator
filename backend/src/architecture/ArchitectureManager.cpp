#include "architecture/ArchitectureManager.hpp"
#include "memory/MemoryAccessor.hpp"

#include <regex>

#include "common/ExecutablePath.hpp"

std::regex pattern(R"(^(?:lib)?(.+)\.(?:dll|so|dylib)$)");

ArchitectureManager::ArchitectureManager(std::filesystem::path architecturePath) {
    m_architecturePath = std::filesystem::absolute(executable_directory() / architecturePath);

    for (const auto& entry : std::filesystem::directory_iterator(m_architecturePath)) {
        if (!entry.is_regular_file())
            continue;

        const auto filename = entry.path().filename().string();

        std::smatch match;

        if (std::regex_match(filename, match, pattern))
            m_availableArchitectures.insert(match[1]);
    }
}

const std::unordered_set<std::string>& ArchitectureManager::ListAvailableArchitectures() {
    return m_availableArchitectures;
}

void ArchitectureManager::LoadArchitecture(const std::string& architectureId, MemoryAccessor memory, RegisterAccessor registerAccessor) {
    if (m_availableArchitectures.find(architectureId) == m_availableArchitectures.end())
        throw std::runtime_error("Architecture not found: " + architectureId);

    m_currentArchitecture.load(m_architecturePath / architectureId, memory, registerAccessor);
}

IArchitecture* ArchitectureManager::get() const {
    return m_currentArchitecture.get();
}