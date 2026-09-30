#include "memory/RegisterAccessor.hpp"

#include <memory>

#include "architecture/events/EventManager.hpp"
#include "architecture/events/RegisterRead.hpp"
#include "architecture/events/RegisterWrite.hpp"
#include "memory/Registers.hpp"

void RegisterAccessor::write(const char* name, const std::vector<byte_t>& value) {
    const std::vector<byte_t> old_value = m_parent.read(name);
    const std::string register_name(name);

    m_eventManager.commit(
        std::make_unique<architecture::events::RegisterWrite>(register_name, value, old_value));
}

void RegisterAccessor::write(std::uint8_t id, const std::vector<byte_t>& value) {
    write(m_parent.getName(id).c_str(), value);
}

void RegisterAccessor::clear(const char* name, std::uint8_t fill) {
    const std::vector<byte_t> old_value = m_parent.read(name);
    const std::string register_name(name);

    m_parent.clear(name, fill);
    m_eventManager.commit(
        std::make_unique<architecture::events::RegisterWrite>(register_name, m_parent.read(name), old_value));
}
void RegisterAccessor::clear(std::uint8_t id, std::uint8_t fill){
    m_parent.clear(m_parent.getName(id).c_str(), fill);
}

const std::vector<byte_t>& RegisterAccessor::read(const char* name) {
    const std::vector<byte_t>& value = m_parent.read(name);

    m_eventManager.commit(
        std::make_unique<architecture::events::RegisterRead>(std::string(name), value));

    return value;
}

const std::vector<byte_t>& RegisterAccessor::read(uint8_t id) {
    return read(m_parent.getName(id).c_str());
}
