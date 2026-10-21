#include "Server.hpp"

#include <regex>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

#include "api/ApiError.hpp"
#include "architecture/InfoSerializer.hpp"

using json = nlohmann::json;

namespace {

// httplib percent-decodes the path before routing and lets `:param` match a
// trailing '/'. Without this check, `/sessions/<id>%2Fprojects` would run
// GET /sessions/{sessionId}/projects and `/sessions/<id>/` would run
// GET /sessions/{sessionId}. No documented path has an encoded '/' in a
// segment or ends with '/', so such requests get 404 not-found instead.
// The query string (e.g. ?path=src%2Fmain.asm) is not affected.
bool is_unroutable_path(const httplib::Request& req) {
    if (req.path.size() > 1 && req.path.back() == '/')
        return true;

    const std::string_view target = req.target;
    const std::string_view path = target.substr(0, target.find('?'));
    for (std::size_t i = 0; i + 2 < path.size(); ++i) {
        if (path[i] == '%' && path[i + 1] == '2' && (path[i + 2] == 'F' || path[i + 2] == 'f'))
            return true;
    }
    return false;
}

} // namespace

Server::Server(Simulator& simulator)
    : m_simulator(simulator) {
    set_max_body_bytes(kDefaultMaxBodyBytes);

    // httplib's default sets SO_REUSEPORT, which lets a second process bind
    // the same port and take part of the connections; with sessions held in
    // memory that makes them randomly "not found". Bind exclusively instead,
    // so a second server fails to start.
    this->set_socket_options([](socket_t sock) {
#ifdef _WIN32
        httplib::set_socket_opt(sock, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, 1);
#else
        httplib::set_socket_opt(sock, SOL_SOCKET, SO_REUSEADDR, 1);
#endif
    });
}

void Server::setup(int port) {
    setup_cors();
    setup_errors();
    setup_http();
    setup_ws();

    m_port = port;
}

void Server::set_max_body_bytes(std::size_t bytes) {
    this->set_payload_max_length(bytes);
}

void Server::set_session_limits(const session::StoreLimits& limits) {
    m_sessions.set_limits(limits);
}

void Server::set_host(const std::string& host) {
    m_host = host;
}
void Server::set_socket_flags(int socket_flags) {
    m_socket_flags = socket_flags;
}
bool Server::listen() {
    if (!this->bind_to_port(m_host, m_port, m_socket_flags)) {
        std::cerr << "Failed to bind " << m_host << ':' << m_port << " (is another server using it?)" << std::endl;
        return false;
    }
    // Printed only once the port is ours; the API tests wait for this line.
    std::cout << "Listening on " << m_host << ':' << m_port << std::endl;
    return this->listen_after_bind();
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

        if (is_unroutable_path(req)) {
            const api::ApiError error = api::route_not_found();
            res.status = error.status;
            res.set_content(error.to_json().dump(), "application/json");

            return httplib::Server::HandlerResponse::Handled;
        }

        return httplib::Server::HandlerResponse::Unhandled;
    });
}

void Server::setup_http() {
    // Documented API: api_spec/openapi.yaml.
    this->setup_http_api();

    // DEPRECATED legacy routes below: not part of the OpenAPI document. The
    // frontend no longer calls /heartbeat (use GET /health) or
    // /simulator/archs (use GET /simulator/architectures), but it still needs
    // two of the project routes to run anything: see http/Project.cpp.
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
enum class Command { LOAD_PROJECT, LOAD_FILE, RESET, CLEAR, STEP };

const std::vector<std::pair<std::regex, Command>> patterns = {
    {std::regex{R"(^load \$([A-Za-z0-9._-]+)$)"}, Command::LOAD_PROJECT},
    {std::regex{R"(^load %(.+)$)"}, Command::LOAD_FILE},
    {std::regex{R"(^reset$)"}, Command::RESET},
    {std::regex{R"(^clear$)"}, Command::CLEAR},
    {std::regex{R"(^step$)"}, Command::STEP},
};

void Server::setup_ws() {
    this->WebSocket("/ws", [this](const httplib::Request&, httplib::ws::WebSocket& ws) {
        std::cout << "WebSocket client connected" << std::endl;

        std::string message;

        while (ws.read(message)) {
            std::cout << "[RECV]: " << message << '\n';

            json request;
            try {
                request = json::parse(message);
            } catch (const json::parse_error&) {
                const json response = {
                    {"id", nullptr},
                    {"error", api::invalid_request("Request body must be valid JSON").to_json()}};
                ws.send(response.dump());
                continue;
            }

            const json id = request.is_object() && request.contains("id")
                                ? request["id"]
                                : json(nullptr);
            json response;

            {
                std::lock_guard<std::mutex> lock(this->mutex);
                const std::size_t eventStart = m_simulator.event_count();

                try {
                    if (!request.is_object())
                        throw api::invalid_request("WebSocket request must be a JSON object");
                    if (id.is_null())
                        throw api::invalid_request("WebSocket request is missing a non-null id");
                    if (!request.contains("type") || request["type"] != "command")
                        throw api::invalid_request("WebSocket request type must be 'command'");
                    if (!request.contains("payload") || !request["payload"].is_string())
                        throw api::invalid_request("WebSocket command payload must be a string");

                    const std::string commandText = request["payload"].get<std::string>();
                    bool matched = false;

                    for (const auto& [pattern, command] : patterns) {
                        std::smatch match;
                        if (!std::regex_match(commandText, match, pattern))
                            continue;

                        matched = true;
                        switch (command) {
                            case Command::LOAD_PROJECT: {
                                Project project = m_simulator.load_project(match[1]);
                                json proj;
                                to_json(proj, project);

                                const ArchitectureInfo* info = m_simulator.currentInfo();
                                response = {{"id", id},
                                            {"result", json{{"project", proj},
                                                             {"arch", InfoSerializer::serialize(*info)}}}};
                                break;
                            }
                            case Command::LOAD_FILE: {
                                const EventBatch batch = m_simulator.load_file(match[1]);
                                response = {{"id", id}, {"result", batch.serialize()}};
                                break;
                            }
                            case Command::RESET: {
                                const EventBatch batch = m_simulator.reset();
                                response = {{"id", id}, {"result", batch.serialize()}};
                                break;
                            }
                            case Command::CLEAR: {
                                const EventBatch batch = m_simulator.clear();
                                response = {{"id", id}, {"result", batch.serialize()}};
                                break;
                            }
                            case Command::STEP: {
                                const EventBatch batch = m_simulator.step();
                                response = {{"id", id}, {"result", batch.events}};
                                break;
                            }
                        }
                        break;
                    }

                    if (!matched)
                        throw api::invalid_request("Unknown simulator command: " + commandText);
                } catch (const api::ApiError& error) {
                    json problem = error.to_json();
                    const EventBatch changed = m_simulator.event_batch(eventStart);
                    if (!changed.events.empty())
                        problem["events"] = changed.events;
                    response = {{"id", id}, {"error", std::move(problem)}};
                } catch (const std::exception& error) {
                    json problem = api::invalid_request(error.what()).to_json();
                    const EventBatch changed = m_simulator.event_batch(eventStart);
                    if (!changed.events.empty())
                        problem["events"] = changed.events;
                    response = {{"id", id}, {"error", std::move(problem)}};
                } catch (...) {
                    json problem = api::internal_error().to_json();
                    const EventBatch changed = m_simulator.event_batch(eventStart);
                    if (!changed.events.empty())
                        problem["events"] = changed.events;
                    response = {{"id", id}, {"error", std::move(problem)}};
                }
            }

            const std::string serialized = response.dump();
            ws.send(serialized);
            std::cout << "[SENT]: " << serialized << "\n\n\n";
        }
        std::cout << "WebSocket client disconnected :)" << std::endl;
    });
}
