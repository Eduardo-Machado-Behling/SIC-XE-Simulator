#pragma once

#include <string>
#include <unordered_map>

#include "pch/JSON.hpp"

struct Project {
    std::string id;
    std::string name;
    std::string architecture;

    std::unordered_map<std::string, std::string> files;
};

inline void to_json(nlohmann::json& j, const Project& project)
{
    j = {
        {"id", project.id},
        {"name", project.name},
        {"architecture", project.architecture},
        {"files", project.files}
    };
}