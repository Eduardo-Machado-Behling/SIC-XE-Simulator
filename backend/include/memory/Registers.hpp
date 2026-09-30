#pragma once

#include <cstddef>
#include <cstdint>
#include <exception>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include "memory/RegisterAccessor.hpp"

namespace architecture::events {
class EventManager;
}

struct UnkownRegister : public std::exception {
    explicit UnkownRegister(std::string message)
        : msg(std::move(message)) {}

    const char* what() const noexcept override { return msg.c_str(); }

private:
    std::string msg;
};

class Registers {
public:
    void write(const char* name, std::uint64_t value);
    void write(std::uint8_t id, std::uint64_t value);
    void write(const char* name, const std::vector<byte_t>& value);
    void write(std::uint8_t id, const std::vector<byte_t>& value);

    const std::vector<byte_t>& read(const char* name) const;
    const std::vector<byte_t>& read(std::uint8_t id) const;
    std::vector<byte_t> encode(const char* name, std::uint64_t value) const;

    void clear(std::uint8_t fill = 0x00);
    void clear(const char* name, std::uint8_t fill = 0x00);

    const std::string& getName(std::uint8_t id) const;

    void allocate(std::uint8_t id, const char* name, std::size_t width);
    void deallocate(const char* name);

    RegisterAccessor getAccessor(architecture::events::EventManager& eventManager);

private:
    std::unordered_map<std::string, std::vector<byte_t>> m_registers;
    std::unordered_map<uint8_t, std::string> m_id_to_reg;
    std::unordered_map<std::string, uint8_t> m_name_to_reg;
};
