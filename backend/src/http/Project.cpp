// DEPRECATED legacy routes, not part of api_spec/openapi.yaml. They act on
// the global (non-session) project list, the only one the /ws protocol reads.
// New clients must use the session-scoped routes in http/Api.cpp.
//
// Do NOT remove PUT /project and PUT /simulator/project/file yet: the frontend
// (frontend/src/lib/simulator/LegacyExecutionBridge.ts) stages every browser
// project through them before it binds the simulator and before every Run,
// because /ws `load $<id>` cannot load session projects. They can go once /ws
// can (the open contract question of issue #41). GET /projects,
// POST /project/load and POST /simulator/project/file are no longer called by
// the frontend.

#include "Server.hpp"

using json = nlohmann::json;

void Server::setup_http_project() {
    this->Get("/projects", [this](const httplib::Request& req, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(this->mutex);
        json response = json::array();

        for (const auto& project : this->m_simulator.list_projects()) {
            response.push_back(project);
        }

        res.set_content(response.dump(), "application/json");
    });

    this->Put("/project", [this](const httplib::Request& req, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(this->mutex);
        try {
            if (!(req.has_param("name") && req.has_param("id") && req.has_param("arch"))) {
                throw std::runtime_error("Missing 'project' parameter");
            }

            m_simulator.create_project(req.get_param_value("id"),
                                       req.get_param_value("name"),
                                       req.get_param_value("arch"));
        } catch (const std::exception& e) {
            res.status = 400;
            json errorResponse = {{"error", e.what()}};
            res.set_content(errorResponse.dump(), "application/json");
            return;
        }

        json response = {{"message", "created project " + req.get_param_value("name")}};
        res.set_content(response.dump(), "application/json");
    });

    this->Post("/project/load", [this](const httplib::Request& req, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(this->mutex);
        try {
            if (!(req.has_param("id"))) {
                throw std::runtime_error("Missing 'project' parameter");
            }

            m_simulator.load_project(req.get_param_value("id"));
        } catch (const std::exception& e) {
            res.status = 400;
            json errorResponse = {{"error", e.what()}};
            res.set_content(errorResponse.dump(), "application/json");
            return;
        }

        json response = {{"message", "loaded project " + req.get_param_value("project")}};
        res.set_content(response.dump(), "application/json");
    });

    this->Post("/simulator/project/file",
               [this](const httplib::Request& req, httplib::Response& res) {
                   std::lock_guard<std::mutex> lock(this->mutex);
                   try {
                       const auto request_json = nlohmann::json::parse(req.body);

                       const EventBatch batch =
                           m_simulator.load_file(
                               request_json.at("filePath").get<std::string>());
                       json response = batch.serialize();
                       response["message"] = "loaded file";
                       res.set_content(response.dump(), "application/json");
                   } catch (const std::exception& e) {
                       res.status = 400;
                       json errorResponse = {{"error", e.what()}};
                       res.set_content(errorResponse.dump(), "application/json");
                       return;
                   }

               });

    this->Put("/simulator/project/file",
              [this](const httplib::Request& req, httplib::Response& res) {
                   std::lock_guard<std::mutex> lock(this->mutex);
                  try {
                      const auto json = nlohmann::json::parse(req.body);

                      m_simulator.set_file(json.at("filePath").get<std::string>(),
                                           json.at("content").get<std::string>());
                  } catch (const std::exception& e) {
                      res.status = 400;
                      json errorResponse = {{"error", e.what()}};
                      res.set_content(errorResponse.dump(), "application/json");
                      return;
                  }

                  json response = {{"message", "setted file"}};
                  res.set_content(response.dump(), "application/json");
              });
}
