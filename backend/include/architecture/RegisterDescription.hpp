#pragma once

#include <cstdint>


enum class RegisterType { GENERAL_PURPOSE = 0, SPECIAL_PURPOSE };

struct RegisterDescription {
    RegisterDescription(uint32_t id,
                        const char* name,
                        const char* description,
                        uint32_t width,
                        RegisterType type = RegisterType::SPECIAL_PURPOSE)
        : id(id)
        , name(name)
        , description(description)
        , width(width)
        , type(type) {}

    uint32_t id;

    const char* name;

    const char* description;

    uint32_t width;

    RegisterType type;
};
