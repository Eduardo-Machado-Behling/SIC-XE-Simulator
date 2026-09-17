#include "memory/Registers.hpp"

void Registers::write(const char* name, uint64_t value) {
    if (m_registers.find(name) == m_registers.end()) {
        throw UnkownRegister(name);
    }

    m_registers[name] = value;
}

uint64_t Registers::read(const char* name) {
    if (m_registers.find(name) == m_registers.end()) {
        throw UnkownRegister(name);
    }

    return m_registers.at(name);
}


void clear(){
}

RegisterAccessor Registers::getAccessor() {
    return RegisterAccessor(*this);
}

void Registers::allocate(const char* name, uint64_t initial_value) {
    m_registers[name] = initial_value;
}

void Registers::deallocate(const char* name) {
    m_registers.erase(name);
}
