#pragma once

#include <span>
#include <string>
#include <unordered_map>
#include <ranges>

#include "project/Project.hpp"
class ProjectManager {
public:

    ProjectManager() = default;
    ~ProjectManager() = default;

    using ProjectMap = std::unordered_map<std::string, Project>;

    struct ProjectValue {
        const Project& operator()(const ProjectMap::value_type& entry) const {
            return entry.second;
        }
    };

    using ProjectView = std::ranges::transform_view<
        std::ranges::ref_view<const ProjectMap>,
        ProjectValue
    >;

    ProjectView listProjects() const;
    void addProject(const Project& project);
    void removeProject(const std::string& projectId);
    Project& getProject(const std::string& projectId);

private:
    std::unordered_map<std::string, Project> m_projects;
};