#pragma once

#include <string>
#include <unordered_map>

struct Project {
    std::string id;
    std::string name;
    std::string architecture;

    std::unordered_map<std::string, std::string> files;
};