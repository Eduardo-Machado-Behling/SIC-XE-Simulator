#pragma once

#include <cstddef>

#include "architecture/ArchitectureManager.hpp"
#include "architecture/events/EventManager.hpp"

#include "memory/Memory.hpp"
#include "memory/Registers.hpp"

#include "project/ProjectManager.hpp"

struct EventBatch {
    std::size_t from = 0;
    std::size_t to = 0;
    nlohmann::json events = nlohmann::json::array();

    nlohmann::json serialize() const {
        return {{"from", from}, {"to", to}, {"events", events}};
    }
};

class Simulator {
public:
    Simulator()
        : m_architectureManager("archs")
        , m_eventManager(m_memory, m_registers) {}

    ProjectManager::ProjectView list_projects();

    void create_project(const std::string& projectId,
                        const std::string& projectName,
                        const std::string& architectureId);

    const Project& load_project(const std::string& project);

    void set_file(const std::string& filepath, const std::string& content);
    EventBatch load_file(const std::string& filepath);

    const std::unordered_set<std::string>& ListAvailableArchitectures();
    const ArchitectureInfo* currentInfo();

    void run();
    void stop();
    EventBatch reset();

    EventBatch step();

    // TODO:
    //  Delta unstep();

    // void add_breakpoint(Address address);
    // void remove_breakpoint(Address address);

private:
    Project* m_currentProject = nullptr;

    ArchitectureManager m_architectureManager;
    ProjectManager m_projectManager;
    Memory m_memory;
    Registers m_registers;
    architecture::events::EventManager m_eventManager;
};
