#pragma once

#include <exception>
#include <string>
#include <unordered_map>
#include <vector>

#include "memory/RegisterAccessor.hpp"

struct UnkownRegister : public std::exception {
    UnkownRegister(const char* message)
        : msg(message) {}

    const char* what() const noexcept override { return msg; }

private:
    const char* msg;
};

class Registers {
public:
    void write(const char* name, uint64_t value);
    uint64_t read(const char* name);

    void clear();

    void allocate(const char* name, uint64_t initial_value);
    void deallocate(const char* name);

    RegisterAccessor getAccessor();

private:
    std::unordered_map<std::string, uint64_t> m_registers;
};
