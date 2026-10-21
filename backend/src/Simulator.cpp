#include "Simulator.hpp"

#include <stdexcept>
#include <utility>

const Project& Simulator::load_project(Project project) {
    m_currentProject = std::move(project);
    m_hasCurrentProject = true;

    // A new project establishes a new simulator-state baseline.
    m_eventManager.clear();
    m_memory.clear();
    m_registers.deallocate_all();

    m_architectureManager.LoadArchitecture(m_currentProject.architecture,
                                           m_memoryAccessor,
                                           m_registerAccessor,
                                           m_eventManager);
    m_memory.resize(m_architectureManager.get()->info().memory.address_space_size);
    m_memory.clear();

    for (auto& reg : m_architectureManager.get()->info().registers) {
        m_registers.allocate(reg.id, reg.name, reg.width);
    }

    m_architectureManager.get()->reset();

    return m_currentProject;
}

EventBatch Simulator::load_file(const std::string& filepath) {
    const std::size_t from = m_eventManager.size();

    if (!m_hasCurrentProject)
        throw std::runtime_error("No project is loaded");
    if (!m_architectureManager.get())
        throw std::runtime_error("No architecture is loaded");
    if (m_currentProject.files.find(filepath) == m_currentProject.files.end())
        throw std::runtime_error("File not found in the current project: " + filepath);

    m_architectureManager.get()->load_file(m_currentProject.files.at(filepath));

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
        throw std::runtime_error("No architecture is loaded");

    const std::size_t from = m_eventManager.size();
    arch->reset();
    arch->consume_events(); // Drain legacy notifications during migration.

    const std::size_t to = m_eventManager.size();
    return {from, to, m_eventManager.events_since(from)};
}

EventBatch Simulator::clear() {
    const std::size_t from = m_eventManager.size();
    if (IArchitecture* arch = m_architectureManager.get()) {
        arch->clear();
    } else {
        m_memoryAccessor.clear();
        m_registers.clear();
    }

    const std::size_t to = m_eventManager.size();
    return {from, to, m_eventManager.events_since(from)};
}

EventBatch Simulator::step() {
    IArchitecture* arch = m_architectureManager.get();

    if (!arch) {
        throw std::runtime_error("No architecture is loaded");
    }

    const std::size_t from = m_eventManager.size();
    arch->step();
    arch->consume_events(); // Drain legacy notifications during migration.

    const std::size_t to = m_eventManager.size();
    return {from, to, m_eventManager.events_since(from)};
}

std::size_t Simulator::event_count() const noexcept {
    return m_eventManager.size();
}

EventBatch Simulator::event_batch(std::size_t from) const {
    const std::size_t to = m_eventManager.size();
    if (from > to)
        from = 0; // A project load establishes a new event-history baseline.
    return {from, to, m_eventManager.events_since(from)};
}
