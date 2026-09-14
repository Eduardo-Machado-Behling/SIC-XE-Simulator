#include <cstdlib>
#include <iostream>
#include <string>

#include <httplib.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

int main()
{
    httplib::Server server;

    // -------------------------
    // CORS
    // -------------------------

    server.set_pre_routing_handler(
        [](const httplib::Request& req,
           httplib::Response& res)
        {
            res.set_header(
                "Access-Control-Allow-Origin",
                "*"
            );

            res.set_header(
                "Access-Control-Allow-Methods",
                "GET, POST, PUT, DELETE, OPTIONS"
            );

            res.set_header(
                "Access-Control-Allow-Headers",
                "Content-Type"
            );

            if (req.method == "OPTIONS")
            {
                res.status = 204;

                return httplib::Server::HandlerResponse::Handled;
            }

            return httplib::Server::HandlerResponse::Unhandled;
        }
    );

    // -------------------------
    // HTTP Routes
    // -------------------------

    server.Get(
        "/api/hello",
        [](const httplib::Request&,
           httplib::Response& res)
        {
            json response = {
                {"message", "Hello from C++!"},
                {"language", "C++"},
                {"framework", "cpp-httplib"}
            };

            res.set_content(
                response.dump(),
                "application/json"
            );
        }
    );

    // -------------------------
    // WebSocket
    // -------------------------

    server.WebSocket(
        "/ws",
        [](const httplib::Request&,
           httplib::ws::WebSocket& ws)
        {
            std::cout
                << "WebSocket client connected"
                << std::endl;

            std::string message;

            while (ws.read(message))
            {
                std::cout
                    << "WebSocket received: "
                    << message
                    << std::endl;

                ws.send(message);
            }

            std::cout
                << "WebSocket client disconnected"
                << std::endl;
        }
    );

    // -------------------------
    // PORT
    // -------------------------

    int port = 8080;

    if (const char* env_port = std::getenv("PORT"))
    {
        port = std::atoi(env_port);
    }

    std::cout
        << "API running on port "
        << port
        << std::endl;

    std::cout
        << "WebSocket endpoint: "
        << "ws://localhost:"
        << port
        << "/ws"
        << std::endl;

    server.listen(
        "0.0.0.0",
        port
    );

    return 0;
}