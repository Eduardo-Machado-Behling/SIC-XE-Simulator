#pragma once

#include <cstddef>
#include <cstring>
#include <vector>
#include "common/Byte.hpp"
#include "memory/LinkQueue.hpp"

class Memory;
namespace architecture::events { class EventManager; }

struct MemoryAccessor : public LinkQueue {
	using Iterator = std::vector<byte_t>::iterator;

    void write(size_t address, const std::vector<byte_t>& data);
    void read(size_t address, size_t size, std::vector<byte_t>& buffer);
    void read(size_t address, Iterator begin, Iterator end);
    void fetch(size_t address, size_t size, std::vector<byte_t>& buffer);


	template <typename T>
	T read(size_t address){
		std::vector<byte_t> buf;
		buf.reserve(sizeof(T));
		read(address, sizeof(T), buf);

		T dest;
		memcpy(&dest, buf.data(), sizeof(T));
		return dest;
	}

private:
    MemoryAccessor(Memory& parent, architecture::events::EventManager& eventManager)
        : m_parent(parent), m_eventManager(eventManager) {}

    Memory& m_parent;
    architecture::events::EventManager& m_eventManager;

    friend class Memory;
};
