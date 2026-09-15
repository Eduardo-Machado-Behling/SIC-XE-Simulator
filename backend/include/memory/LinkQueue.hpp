#pragma once

#include "architecture/ExecutionEvent.hpp"

struct LinkQueue {
    void link(EventQueue* queue){
        m_queue = queue;
    }
    void unlink(){
        m_queue = nullptr;
    }

protected:
    EventQueue* m_queue;
};