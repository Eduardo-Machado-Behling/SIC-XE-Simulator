#pragma once

#include <cstdint>

#include "architecture/ArchitectureInfo.hpp"
#include "architecture/ExecutionEvent.hpp"

#include "memory/MemoryAccessor.hpp"
#include "memory/RegisterAccessor.hpp"

class IArchitecture {
public:
    IArchitecture(MemoryAccessor& memoryAccessor, RegisterAccessor& registerAccessor)
        : m_memoryAccessor(memoryAccessor), m_registerAccessor(registerAccessor) {}
    virtual ~IArchitecture() = default;


    virtual const ArchitectureInfo& info() const noexcept = 0;


    virtual void reset() = 0;

    virtual void step() = 0;

    virtual std::vector<ExecutionEvent> consume_events() = 0;

protected:
    MemoryAccessor m_memoryAccessor;
    RegisterAccessor m_registerAccessor;
};