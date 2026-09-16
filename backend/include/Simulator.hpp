#pragma once

#include "architecture/ArchitectureManager.hpp"
#include "memory/Memory.hpp"
#include "memory/Registers.hpp"
#include "project/ProjectManager.hpp"

class Simulator {
public:
    Simulator()
        : m_architectureManager("archs") {}

    void create_project(const std::string& projectId,
                        const std::string& projectName,
                        const std::string& architectureId);

    void load_project(const std::string& project);

    void set_file(const std::string& filepath, const std::string& content);
    void load_file(const std::string& filepath);

    const std::unordered_set<std::string>& ListAvailableArchitectures();

    void run();
    void stop();
    void reset();

    std::vector<ExecutionEvent> step();

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
};