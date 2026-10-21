#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>

#include "Server.hpp"
#include "Simulator.hpp"

namespace {

// Reads a non-negative integer environment variable into `out`. Leaves `out`
// unchanged (and says so) when the value is not a plain number, or is zero
// and zero is not allowed.
template <typename T>
void read_env_number(const char* name, T& out, bool allow_zero = false) {
    const char* value = std::getenv(name);
    if (!value)
        return;

    char* end = nullptr;
    const unsigned long long number = std::strtoull(value, &end, 10);

    if (value[0] != '-' && end != value && *end == '\0' && (number > 0 || allow_zero)) {
        out = static_cast<T>(number);
    } else {
        std::cerr << "Ignoring invalid " << name << "=" << value << std::endl;
    }
}

} // namespace

int main() {
    Simulator simulator;
    Server server(simulator);

    int port = 8080;

    if (const char* env_port = std::getenv("PORT")) {
        port = std::atoi(env_port);
    }

    std::string host = "0.0.0.0";

    if (const char* env_host = std::getenv("HOST")) {
        host = env_host;
    }

    // Request body limit in bytes (bodies above it get 413).
    std::size_t max_body_bytes = Server::kDefaultMaxBodyBytes;
    read_env_number("MAX_BODY_BYTES", max_body_bytes);
    server.set_max_body_bytes(max_body_bytes);

    // Bounds on the in-memory session store (see session::StoreLimits).
    session::StoreLimits limits;
    read_env_number("MAX_SESSIONS", limits.maxSessions);
    read_env_number("MAX_SESSION_BYTES", limits.maxSessionBytes);
    read_env_number("MAX_TOTAL_BYTES", limits.maxTotalBytes);
    long long ttl_seconds = limits.sessionTtl.count();
    read_env_number("SESSION_TTL_SECONDS", ttl_seconds, /*allow_zero=*/true);
    limits.sessionTtl = std::chrono::seconds{ttl_seconds};
    server.set_session_limits(limits);

    server.setup(port);
    server.set_host(host);

    std::cout << "API running on port " << port << std::endl;

    std::cout << "WebSocket endpoint: "
              << "ws://localhost:" << port << "/ws" << std::endl;

    server.listen();

    return 0;
}