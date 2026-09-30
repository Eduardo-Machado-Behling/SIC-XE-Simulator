#include "Simulator.hpp"

ProjectManager::ProjectView Simulator::list_projects() {
    return m_projectManager.listProjects();
}

void Simulator::create_project(const std::string& projectId,
                               const std::string& projectName,
                               const std::string& architectureId) {
    m_projectManager.addProject({projectId, projectName, architectureId});
}

const Project& Simulator::load_project(const std::string& project) {
    m_currentProject = &m_projectManager.getProject(project);

    // A new project establishes a new simulator-state baseline.
    m_eventManager.clear();

    m_architectureManager.LoadArchitecture(m_currentProject->architecture,
                                           m_memory.getAccessor(m_eventManager),
                                           m_registers.getAccessor(m_eventManager),
                                           m_eventManager);
    m_memory.resize(m_architectureManager.get()->info().memory.address_space_size);

    for (auto& reg : m_architectureManager.get()->info().registers) {
        m_registers.allocate(reg.id, reg.name, reg.width);
    }

    m_architectureManager.get()->reset();

    return *m_currentProject;
}

void Simulator::set_file(const std::string& filepath, const std::string& content) {
    if (!m_currentProject)
        return;

    m_currentProject->files[filepath] = content;
}

EventBatch Simulator::load_file(const std::string& filepath) {
    const std::size_t from = m_eventManager.size();

    if (!m_currentProject ||
        m_currentProject->files.find(filepath) == m_currentProject->files.end())
        return {from, from, nlohmann::json::array()};

    m_memory.clear();
    m_architectureManager.get()->load_file(m_currentProject->files.at(filepath));

    const std::size_t to = m_eventManager.size();
    return {from, to, m_eventManager.events_since(from)};
}

const std::unordered_set<std::string>& Simulator::ListAvailableArchitectures() {
    return m_architectureManager.ListAvailableArchitectures();
}

const ArchitectureInfo* Simulator::currentInfo() {
    if (!m_architectureManager.get())
        return nullptr;

    return &m_architectureManager.get()->info();
}

void Simulator::run() {}

EventBatch Simulator::reset() {
    IArchitecture* arch = m_architectureManager.get();

    if (!arch)
        return {m_eventManager.size(), m_eventManager.size(), nlohmann::json::array()};

    const std::size_t from = m_eventManager.size();
    arch->reset();
    arch->consume_events(); // Drain legacy notifications during migration.

    const std::size_t to = m_eventManager.size();
    return {from, to, m_eventManager.events_since(from)};
}

EventBatch Simulator::step() {
    IArchitecture* arch = m_architectureManager.get();

    if (!arch) {
        return {m_eventManager.size(), m_eventManager.size(), nlohmann::json::array()};
    }

    const std::size_t from = m_eventManager.size();
    arch->step();
    arch->consume_events(); // Drain legacy notifications during migration.

    const std::size_t to = m_eventManager.size();
    return {from, to, m_eventManager.events_since(from)};
}
