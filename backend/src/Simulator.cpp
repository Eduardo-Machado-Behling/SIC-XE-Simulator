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

    m_architectureManager.LoadArchitecture(m_currentProject->architecture,
                                           m_memory.getAccessor(),
                                           m_registers.getAccessor());
    m_memory.resize(m_architectureManager.get()->info().memory.address_space_size);

    for (auto& reg : m_architectureManager.get()->info().registers) {
        m_registers.allocate(reg.name, 0ull);
    }

    m_architectureManager.get()->reset();

    return *m_currentProject;
}

void Simulator::set_file(const std::string& filepath, const std::string& content) {
    if (!m_currentProject)
        return;

    m_currentProject->files[filepath] = content;
}

void Simulator::load_file(const std::string& filepath) {
    if (!m_currentProject ||
        m_currentProject->files.find(filepath) == m_currentProject->files.end())
        return;

    m_memory.clear();
    m_memory.load(std::stringstream(m_currentProject->files.at(filepath)));
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

void Simulator::stop() {}

void Simulator::reset() {
    IArchitecture* arch = m_architectureManager.get();

    if (!arch)
        return;

    arch->reset();
    arch->consume_events();
}

std::vector<ExecutionEvent> Simulator::step() {
    IArchitecture* arch = m_architectureManager.get();

    if (!arch) {
        return {};
    }

    arch->step();
    return arch->consume_events();
}
