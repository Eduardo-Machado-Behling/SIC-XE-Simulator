
#include "Server.hpp"

#include "architecture/EventSerializer.hpp"

using json = nlohmann::json;

void Server::setup_http_arch() {
    this->Get("/simulator/archs", [this](const httplib::Request&, httplib::Response& res) {
        json response = {{"message", "Available architectures:"},
                         {"archs", m_simulator.ListAvailableArchitectures()}};

        res.set_content(response.dump(), "application/json");
    });

    this->Put("/simulator/archs",
              [this](const httplib::Request& req, httplib::Response& res) {
                  try {
                      req.has_param("project")
                          ? m_simulator.load_project(req.get_param_value("project"))
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

    this->Get("/simulator/arch/step",
              [this](const httplib::Request& req, httplib::Response& res) {
                  auto v = m_simulator.step();

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
}