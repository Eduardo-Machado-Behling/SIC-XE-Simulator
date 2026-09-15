#include <cstdlib>
#include <httplib.h>
#include <iostream>
#include <nlohmann/json.hpp>
#include <string>

#include "Simulator.hpp"
#include "architecture/EventSerializer.hpp"

using json = nlohmann::json;

int main() {
    httplib::Server server;

    Simulator simulator;

    // -------------------------
    // CORS
    // -------------------------

    server.set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");

        res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

        res.set_header("Access-Control-Allow-Headers", "Content-Type");

        if (req.method == "OPTIONS") {
            res.status = 204;

            return httplib::Server::HandlerResponse::Handled;
        }

        return httplib::Server::HandlerResponse::Unhandled;
    });

    // -------------------------
    // HTTP Routes
    // -------------------------

    server.Get("/api/hello", [](const httplib::Request&, httplib::Response& res) {
        json response = {{"message", "Hello from C++!"},
                         {"language", "C++"},
                         {"framework", "cpp-httplib"}};

        res.set_content(response.dump(), "application/json");
    });

    server.Get("/simulator/archs", [&simulator](const httplib::Request&, httplib::Response& res) {
        json response = {{"message", "Available architectures:"},
                         {"archs", simulator.ListAvailableArchitectures()}};

        res.set_content(response.dump(), "application/json");
    });

    server.Put("/project", [&simulator](const httplib::Request& req, httplib::Response& res) {
        try {
            if (!(req.has_param("name") && req.has_param("id") && req.has_param("arch"))) {
                throw std::runtime_error("Missing 'project' parameter");
            }

            simulator.create_project(req.get_param_value("id"),
                                     req.get_param_value("name"),
                                     req.get_param_value("arch"));
        } catch (const std::exception& e) {
            res.status = 400;
            json errorResponse = {{"error", e.what()}};
            res.set_content(errorResponse.dump(), "application/json");
            return;
        }

        json response = {{"message", "loaded project " + req.get_param_value("project")}};
        res.set_content(response.dump(), "application/json");
    });

    server.Post("/project/load", [&simulator](const httplib::Request& req, httplib::Response& res) {
        try {
            if (!(req.has_param("id"))) {
                throw std::runtime_error("Missing 'project' parameter");
            }

            simulator.load_project(req.get_param_value("id"));
        } catch (const std::exception& e) {
            res.status = 400;
            json errorResponse = {{"error", e.what()}};
            res.set_content(errorResponse.dump(), "application/json");
            return;
        }

        json response = {{"message", "loaded project " + req.get_param_value("project")}};
        res.set_content(response.dump(), "application/json");
    });

    server.Post("/simulator/project/file",
               [&simulator](const httplib::Request& req, httplib::Response& res) {
                   try {
                       const auto json = nlohmann::json::parse(req.body);

                       simulator.load_file(json.at("filePath").get<std::string>());
                   } catch (const std::exception& e) {
                       res.status = 400;
                       json errorResponse = {{"error", e.what()}};
                       res.set_content(errorResponse.dump(), "application/json");
                       return;
                   }

                   json response = {
                       {"message", "loaded file" }};
                   res.set_content(response.dump(), "application/json");
               });

    server.Put("/simulator/project/file",
               [&simulator](const httplib::Request& req, httplib::Response& res) {
                   try {
                       const auto json = nlohmann::json::parse(req.body);

                       simulator.set_file(json.at("filePath").get<std::string>(),
                                          json.at("content").get<std::string>());
                   } catch (const std::exception& e) {
                       res.status = 400;
                       json errorResponse = {{"error", e.what()}};
                       res.set_content(errorResponse.dump(), "application/json");
                       return;
                   }

                   json response = {
                       {"message", "loaded file" }};
                   res.set_content(response.dump(), "application/json");
               });

    server.Put(
        "/simulator/archs",
        [&simulator](const httplib::Request& req, httplib::Response& res) {
            try {
                req.has_param("project") ? simulator.load_project(req.get_param_value("project"))
                                         : throw std::runtime_error("Missing 'project' parameter");
            } catch (const std::exception& e) {
                res.status = 400;
                json errorResponse = {{"error", e.what()}};
                res.set_content(errorResponse.dump(), "application/json");
                return;
            }

            json response = {{"message", "loaded project " + req.get_param_value("project")}};
            res.set_content(response.dump(), "application/json");
        });

    server.Get("/simulator/arch/step",
               [&simulator](const httplib::Request& req, httplib::Response& res) {
                   auto v = simulator.step();

                   if (v.empty()) {
                       res.status = 400;
                       json errorResponse = {{"error", "No architecture loaded"}};
                       res.set_content(errorResponse.dump(), "application/json");
                       return;
                   }

                   json response = {{"message", "Step completed successfully"},
                                    {"events", EventSerializer::serialize(v)}};
                   res.set_content(response.dump(), "application/json");
               });

    // -------------------------
    // WebSocket
    // -------------------------

    server.WebSocket("/ws", [](const httplib::Request&, httplib::ws::WebSocket& ws) {
        std::cout << "WebSocket client connected" << std::endl;

        std::string message;

        while (ws.read(message)) {
            std::cout << "WebSocket received: " << message << std::endl;

            ws.send(message);
        }

        std::cout << "WebSocket client disconnected" << std::endl;
    });

    // -------------------------
    // PORT
    // -------------------------

    int port = 8080;

    if (const char* env_port = std::getenv("PORT")) {
        port = std::atoi(env_port);
    }

    std::cout << "API running on port " << port << std::endl;

    std::cout << "WebSocket endpoint: "
              << "ws://localhost:" << port << "/ws" << std::endl;

    server.listen("0.0.0.0", port);

    return 0;
}