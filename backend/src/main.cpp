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

    server.setup(port);
    server.set_host(host);

    std::cout << "API running on port " << port << std::endl;

    std::cout << "WebSocket endpoint: "
              << "ws://localhost:" << port << "/ws" << std::endl;

    server.listen();

    return 0;
}