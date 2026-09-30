#include "memory/Registers.hpp"
#include "architecture/events/EventManager.hpp"
#include <algorithm>
#include <stdexcept>

void Registers::write(const char* name, std::uint64_t value) {
    write(name, encode(name, value));
}

void Registers::write(std::uint8_t id, std::uint64_t value) {
    write(getName(id).c_str(), value);
}

void Registers::write(const char* name, const std::vector<byte_t>& value) {
    auto it = m_registers.find(name);
    if (it == m_registers.end()) throw UnkownRegister(name);
    if (value.size() != it->second.size())
        throw std::invalid_argument("Register write has incorrect byte width: " + std::string(name));
    it->second = value;
}

void Registers::write(std::uint8_t id, const std::vector<byte_t>& value) {
    write(getName(id).c_str(), value);
}

const std::vector<byte_t>& Registers::read(const char* name) const {
    auto it = m_registers.find(name);
    if (it == m_registers.end()) throw UnkownRegister(name);
    return it->second;
}

const std::vector<byte_t>& Registers::read(std::uint8_t id) const {
    return read(getName(id).c_str());
}

std::vector<byte_t> Registers::encode(const char* name, std::uint64_t value) const {
    const auto width = read(name).size();
    std::vector<byte_t> bytes(width, 0);
    for (std::size_t i = 0; i < width && i < sizeof(value); ++i) {
        bytes[width - 1 - i] = static_cast<byte_t>(value & 0xffu);
        value >>= 8;
    }
    return bytes;
}

const std::string& Registers::getName(std::uint8_t id) const {
    return m_id_to_reg.at(id);
}

void Registers::clear(std::uint8_t fill) {
    for (auto& [name, value] : m_registers) std::fill(value.begin(), value.end(), 0);
}

void Registers::clear(const char* name, std::uint8_t fill){
    for (auto& [name, value] : m_registers) std::fill(value.begin(), value.end(), fill);
}

RegisterAccessor Registers::getAccessor(architecture::events::EventManager& eventManager) {
    return RegisterAccessor(*this, eventManager);
}

void Registers::allocate(std::uint8_t id, const char* name, std::size_t width) {
    if (width == 0) throw std::invalid_argument("Register width must be non-zero");
    m_registers[name] = std::vector<byte_t>(width, 0);
    m_id_to_reg[id] = name;
    m_name_to_reg[name] = id;
}

void Registers::deallocate(const char* name) {
    m_registers.erase(name);

    auto it = m_name_to_reg.find(name);

    if (it != m_name_to_reg.end()) {
        m_id_to_reg.erase(it->second);
        m_name_to_reg.erase(it);
    }
}
