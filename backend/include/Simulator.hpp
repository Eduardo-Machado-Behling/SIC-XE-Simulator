#pragma once

#include <cstddef>

#include "architecture/ArchitectureManager.hpp"
#include "architecture/events/EventManager.hpp"

#include "memory/Memory.hpp"
#include "memory/Registers.hpp"

#include "project/Project.hpp"

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
        , m_eventManager(m_memory, m_registers)
        , m_memoryAccessor(m_memory.getAccessor(m_eventManager))
        , m_registerAccessor(m_registers.getAccessor(m_eventManager)) {}

    const Project& load_project(Project project);

    EventBatch load_file(const std::string& filepath);

    const std::unordered_set<std::string>& ListAvailableArchitectures();
    const ArchitectureInfo* currentInfo();

    void run();
    void stop();
    EventBatch reset();
    EventBatch clear();

    EventBatch step();

    std::size_t event_count() const noexcept;
    EventBatch event_batch(std::size_t from) const;

    // TODO:
    //  Delta unstep();

    // void add_breakpoint(Address address);
    // void remove_breakpoint(Address address);

private:
    Project m_currentProject;
    bool m_hasCurrentProject = false;

    ArchitectureManager m_architectureManager;
    Memory m_memory;
    Registers m_registers;
    architecture::events::EventManager m_eventManager;
    MemoryAccessor m_memoryAccessor;
    RegisterAccessor m_registerAccessor;
};
