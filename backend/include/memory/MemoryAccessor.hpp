#pragma once

#include <cstring>
#include <vector>
#include "common/Byte.hpp"
#include "memory/LinkQueue.hpp"

class Memory;

struct MemoryAccessor : public LinkQueue {
    void write(size_t address, const std::vector<byte_t>& data);
    void read(size_t address, size_t size, std::vector<byte_t>& buffer);
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
    MemoryAccessor(Memory& parent)
        : m_parent(parent) {}

    Memory& m_parent;

    friend class Memory;
};
