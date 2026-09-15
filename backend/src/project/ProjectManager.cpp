#include "project/ProjectManager.hpp"

void ProjectManager::addProject(const Project& project)
{
    m_projects[project.id] = project;
    m_projects[project.id].files.insert({std::string("main.asm"), std::string("")});
}

void ProjectManager::removeProject(const std::string& projectId)
{
    m_projects.erase(projectId);
}

Project& ProjectManager::getProject(const std::string& projectId)
{
    return m_projects.at(projectId);
}