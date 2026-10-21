#pragma once

#include <cstddef>
#include <mutex>
#include <string>
#include <vector>

#include "Simulator.hpp"
#include "session/SessionStore.hpp"

#include "pch/JSON.hpp"
#include "pch/Server.hpp"

class Server : httplib::Server {
public:
    // Default request body limit; larger bodies get 413 (PayloadTooLarge).
    static constexpr std::size_t kDefaultMaxBodyBytes = 8 * 1024 * 1024;

    Server(Simulator& simulator);

    void setup(int port);
    void set_host(const std::string& host);
    void set_socket_flags(int socket_flags);
    void set_max_body_bytes(std::size_t bytes);
    void set_session_limits(const session::StoreLimits& limits);
    // Binds exclusively, then serves until stopped. False if the bind failed.
    bool listen();

private:
    using httplib::Server::listen;

    void setup_cors();
    void setup_errors();

    void setup_http();
    void setup_http_api();     // documented API (api_spec/openapi.yaml)
    void setup_http_project(); // deprecated legacy routes
    void setup_http_arch();    // deprecated legacy routes

    void setup_ws();

    Simulator& m_simulator;
    session::SessionStore m_sessions;
    std::vector<std::string> m_architectures; // `Architecture` enum values available

    std::string m_host;
    // Guards m_simulator, which is shared by the /ws handler and the legacy
    // HTTP routes (httplib runs handlers on a thread pool).
    std::mutex mutex;

    int m_port;
    int m_socket_flags = 0;
};
