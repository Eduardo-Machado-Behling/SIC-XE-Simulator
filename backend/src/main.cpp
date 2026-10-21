#include <cstdlib>
#include <iostream>
#include <string>

#include "Server.hpp"
#include "Simulator.hpp"

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
    if (const char* env_max_body = std::getenv("MAX_BODY_BYTES")) {
        char* end = nullptr;
        const unsigned long long bytes = std::strtoull(env_max_body, &end, 10);

        if (env_max_body[0] != '-' && end != env_max_body && *end == '\0' && bytes > 0) {
            server.set_max_body_bytes(static_cast<std::size_t>(bytes));
        } else {
            std::cerr << "Ignoring invalid MAX_BODY_BYTES=" << env_max_body << std::endl;
        }
    }

    server.setup(port);
    server.set_host(host);

    std::cout << "API running on port " << port << std::endl;

    std::cout << "WebSocket endpoint: "
              << "ws://localhost:" << port << "/ws" << std::endl;

    server.listen();

    return 0;
}