#pragma once

#include <mutex>

#include "Simulator.hpp"

#include "pch/JSON.hpp"
#include "pch/Server.hpp"

class Server : httplib::Server {
public:
    Server(Simulator& simulator);

    void setup(int port);
    void set_host(const std::string& host);
    void set_socket_flags(int socket_flags);
    void listen();

private:
    using httplib::Server::listen;

    void setup_cors();

    void setup_http();
    void setup_http_project();
    void setup_http_arch();

    void setup_ws();

    Simulator& m_simulator;
    std::string m_host;
    std::mutex mutex;

    int m_port;
    int m_socket_flags = 0;
};