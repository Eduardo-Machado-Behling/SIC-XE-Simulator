#include "architecture/ArchitectureManager.hpp"
#include "memory/MemoryAccessor.hpp"

#include <algorithm>
#include <cctype>
#include <regex>

#include "common/ExecutablePath.hpp"

namespace {

std::string normalize_architecture_id(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return value;
}

} // namespace

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

void ArchitectureManager::LoadArchitecture(
    const std::string& architectureId,
    MemoryAccessor& memory,
    RegisterAccessor& registerAccessor,
    architecture::events::InstructionExecutor& instructionExecutor) {
    const std::string requestedId = normalize_architecture_id(architectureId);
    const auto available = std::find_if(
        m_availableArchitectures.begin(),
        m_availableArchitectures.end(),
        [&](const std::string& id) { return normalize_architecture_id(id) == requestedId; });

    if (available == m_availableArchitectures.end())
        throw std::runtime_error("Architecture not found: " + architectureId);

    // Public/API IDs use their documented spelling (for example "SIC-XE"),
    // while the dynamic library is named using the filesystem spelling
    // ("sic-xe.dll"). Resolve case-insensitively, then load by the real ID.
    m_currentArchitecture.load(m_architecturePath / *available,
                               memory,
                               registerAccessor,
                               instructionExecutor);
}

IArchitecture* ArchitectureManager::get() const {
    return m_currentArchitecture.get();
}
