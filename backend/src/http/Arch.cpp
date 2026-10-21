// DEPRECATED legacy routes, not part of api_spec/openapi.yaml. Kept only
// because the current frontend still calls them until issue #41 lands.
// Use GET /simulator/architectures instead of GET /simulator/archs.

#include "Server.hpp"

using json = nlohmann::json;

void Server::setup_http_arch() {
    this->Get("/simulator/archs", [this](const httplib::Request&, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(this->mutex);
        json response = {{"message", "Available architectures:"},
                         {"archs", m_simulator.ListAvailableArchitectures()}};

        res.set_content(response.dump(), "application/json");
    });

    this->Put("/simulator/archs",
              [this](const httplib::Request& req, httplib::Response& res) {
                  std::lock_guard<std::mutex> lock(this->mutex);
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
                  std::lock_guard<std::mutex> lock(this->mutex);
                  if (!m_simulator.currentInfo()) {
                      res.status = 400;
                      json errorResponse = {{"error", "No architecture loaded"}};
                      res.set_content(errorResponse.dump(), "application/json");
                      return;
                  }

                  const EventBatch batch = m_simulator.step();
                  json response = batch.serialize();
                  response["message"] = "Step completed successfully";
                  res.set_content(response.dump(), "application/json");
              });
}
