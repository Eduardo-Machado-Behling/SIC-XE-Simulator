#include "Server.hpp"

#include <regex>
#include <unordered_map>
#include <vector>

#include "architecture/EventSerializer.hpp"

using json = nlohmann::json;

Server::Server(Simulator& simulator)
    : m_simulator(simulator) {}

void Server::setup(int port) {
    setup_cors();
    setup_http();
    setup_ws();

    m_port = port;
}

void Server::set_host(const std::string& host) {
    m_host = host;
}
void Server::set_socket_flags(int socket_flags) {
    m_socket_flags = socket_flags;
}
void Server::listen() {
    this->listen(m_host, m_port, m_socket_flags);
}

void Server::setup_cors() {
    this->set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");

        res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

        res.set_header("Access-Control-Allow-Headers", "Content-Type");

        if (req.method == "OPTIONS") {
            res.status = 204;

            return httplib::Server::HandlerResponse::Handled;
        }

        return httplib::Server::HandlerResponse::Unhandled;
    });
}

void Server::setup_http() {
    this->Get("/heartbeat", [](const httplib::Request&, httplib::Response& res) {
        json response = {{"message", "Hello from C++!"},
                         {"language", "C++"},
                         {"framework", "cpp-httplib"}};

        res.set_content(response.dump(), "application/json");
    });

    this->setup_http_project();
    this->setup_http_arch();
}

// TODO: this a Jerry-rig, a Jury-rig, a Makeshift solution, a MacGyver, a Quick fix, a Kludge, ...
enum class Command { LOAD_PROJECT, LOAD_FILE, RESET, STEP };

const std::vector<std::pair<std::regex, Command>> patterns = {
    {std::regex{R"(^load \$([\w_]+)$)"}, Command::LOAD_PROJECT},
    {std::regex{R"(^load %([A-Za-z0-9._-]+)$)"}, Command::LOAD_FILE},
    {std::regex{R"(^reset$)"}, Command::RESET},
    {std::regex{R"(^step$)"}, Command::STEP},
};

void Server::setup_ws() {
    this->WebSocket("/ws", [this](const httplib::Request&, httplib::ws::WebSocket& ws) {
        std::cout << "WebSocket client connected" << std::endl;

        std::string message;

        while (ws.read(message)) {
            std::cout << "WebSocket received: " << message << std::endl;

            for (const auto& [pattern, command] : patterns) {
                std::smatch match;

                if (std::regex_match(message, match, pattern)) {
                    switch (command) {
                        case Command::LOAD_PROJECT:
                            std::cout << "Project: " << match[1] << '\n';
                            m_simulator.load_project(match[1]);
                            break;

                        case Command::LOAD_FILE:
                            std::cout << "File: " << match[1] << '\n';
                            m_simulator.load_file(match[1]);
                            break;

                        case Command::RESET:
                            std::cout << "Reset\n";
                            m_simulator.reset();
                            break;

                        case Command::STEP:
                            std::cout << "Step\n";
                            m_simulator.step();
                            break;
                    }

                    break;
                }
            }

            ws.send(message);
        }

        std::cout << "WebSocket client disconnected :)" << std::endl;
    });
}
