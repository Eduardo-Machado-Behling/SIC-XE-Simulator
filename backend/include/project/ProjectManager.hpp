#pragma once

#include "project/Project.hpp"

#include <string>
#include <unordered_map>

class ProjectManager {
public:
    ProjectManager() = default;
    ~ProjectManager() = default;

    void addProject(const Project& project);
    void removeProject(const std::string& projectId);
    Project& getProject(const std::string& projectId);

private:
    std::unordered_map<std::string, Project> m_projects;
};