#pragma once

#include <utility>

namespace PullObserver {
template <typename T>
class Publisher {
public:
    explicit Publisher(T value)
        : value_(std::move(value)) {}

    void set(T value) {
        value_ = std::move(value);
    }

    const T& read() const {
        return value_;
    }

private:
    T value_;
};


template <typename T>
class Subscriber {
public:
    void subscribe(const Publisher<T>* publisher) {
        value_ = publisher_;
    }

    void request() {
        value_ = publisher_->get();
    }

    const T& value() const {
        return value_;
    }

private:
    const Publisher<T>* publisher_;
    T value_{};
};
} // namespace PullObserver