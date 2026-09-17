#include "project/ProjectManager.hpp"


    ProjectManager::ProjectManager(){
        Project proj;

        proj.id = "0";
        proj.name = "Hello";
        proj.architecture = "sic-xe";

        proj.files.insert({"main", ""});

        addProject(proj);
    }
ProjectManager::ProjectView ProjectManager::listProjects() const {
    return std::views::transform(
        std::views::all(m_projects),
        ProjectValue{}
    );
}

void ProjectManager::addProject(const Project& project) {
    m_projects[project.id] = project;
    m_projects[project.id].files.insert({std::string("main.asm"), std::string("")});
}

void ProjectManager::removeProject(const std::string& projectId) {
    m_projects.erase(projectId);
}

Project& ProjectManager::getProject(const std::string& projectId) {
    return m_projects.at(projectId);
}