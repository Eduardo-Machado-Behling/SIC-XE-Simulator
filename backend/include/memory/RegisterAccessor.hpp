#pragma once

#include "common/Byte.hpp"
#include "LinkQueue.hpp"
#include <cstdint>
#include <stdexcept>
#include <type_traits>
#include <vector>


class Registers;
namespace architecture::events { class EventManager; }

struct RegisterAccessor : public LinkQueue {
    void write(const char* name, const std::vector<byte_t>& value);
    void write(std::uint8_t id, const std::vector<byte_t>& value);

    void clear(const char* name, std::uint8_t fill = 0x00);
    void clear(std::uint8_t id, std::uint8_t fill = 0x00);

    const std::vector<byte_t>& read(const char* name);
    const std::vector<byte_t>& read(std::uint8_t id);

private:
    RegisterAccessor(Registers& parent, architecture::events::EventManager& eventManager)
        : m_parent(parent), m_eventManager(eventManager) {}

    Registers& m_parent;
    architecture::events::EventManager& m_eventManager;


    friend class Registers;
};
