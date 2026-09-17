
#include "Server.hpp"
#include "architecture/EventSerializer.hpp"

using json = nlohmann::json;

void Server::setup_http_project() {
    this->Get("/projects", [this](const httplib::Request& req, httplib::Response& res) {
        json response = json::array();

        for (const auto& project : this->m_simulator.list_projects()) {
            response.push_back(project);
        }

        res.set_content(response.dump(), "application/json");
    });

    this->Put("/project", [this](const httplib::Request& req, httplib::Response& res) {
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

        json response = {{"message", "loaded project " + req.get_param_value("project")}};
        res.set_content(response.dump(), "application/json");
    });

    this->Post("/project/load", [this](const httplib::Request& req, httplib::Response& res) {
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
                   try {
                       const auto json = nlohmann::json::parse(req.body);

                       m_simulator.load_file(json.at("filePath").get<std::string>());
                   } catch (const std::exception& e) {
                       res.status = 400;
                       json errorResponse = {{"error", e.what()}};
                       res.set_content(errorResponse.dump(), "application/json");
                       return;
                   }

                   json response = {{"message", "loaded file"}};
                   res.set_content(response.dump(), "application/json");
               });

    this->Put("/simulator/project/file",
              [this](const httplib::Request& req, httplib::Response& res) {
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
