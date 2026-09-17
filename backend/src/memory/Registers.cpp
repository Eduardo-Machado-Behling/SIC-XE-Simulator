#include "memory/Registers.hpp"

void Registers::write(const char* name, uint64_t value) {
    if (m_registers.find(name) == m_registers.end()) {
        throw UnkownRegister(name);
    }

    m_registers[name] = value;
}

void Registers::write(uint8_t id, uint64_t value) {
    write(m_id_to_reg[id].c_str(), value);
}

uint64_t Registers::read(const char* name) {
    if (m_registers.find(name) == m_registers.end()) {
        throw UnkownRegister(name);
    }

    return m_registers.at(name);
}

uint64_t Registers::read(uint8_t id) {
    return read(m_id_to_reg.at(id).c_str());
}

const std::string& Registers::getName(uint8_t id) {
    return m_id_to_reg.at(id);
}

void clear() {}

RegisterAccessor Registers::getAccessor() {
    return RegisterAccessor(*this);
}

void Registers::allocate(uint8_t id, const char* name, uint64_t initial_value) {
    m_registers[name] = initial_value;
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
