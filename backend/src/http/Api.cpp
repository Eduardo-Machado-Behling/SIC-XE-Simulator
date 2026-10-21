// HTTP routes documented in api_spec/openapi.yaml (the source of truth).

#include <algorithm>
#include <cctype>
#include <exception>
#include <iostream>
#include <string>

#include "Server.hpp"
#include "api/ApiError.hpp"
#include "api/Validation.hpp"

using json = nlohmann::json;

namespace {

constexpr const char* kJson = "application/json";

void send_json(httplib::Response& res, int status, const json& body) {
    res.status = status;
    res.set_content(body.dump(-1, ' ', false, json::error_handler_t::replace), kJson);
}

void send_error(httplib::Response& res, const api::ApiError& error) {
    send_json(res, error.status, error.to_json());
}

void send_no_content(httplib::Response& res) {
    res.status = 204;
    res.body.clear();
}

json summary_json(const session::StoredProject& project) {
    return {{"id", project.id},
            {"name", project.name},
            {"architecture", project.architecture},
            {"updatedAt", project.updatedAt}};
}

json project_json(const session::StoredProject& project) {
    json j = summary_json(project);
    j["files"] = project.files;
    return j;
}

json summaries_json(const std::vector<session::StoredProject>& projects) {
    json list = json::array();
    for (const auto& project : projects)
        list.push_back(summary_json(project));
    return list;
}

// Wraps a route so domain errors become documented problem responses.
template <typename Handler>
httplib::Server::Handler api_route(Handler handler) {
    return [handler](const httplib::Request& req, httplib::Response& res) {
        try {
            handler(req, res);
        } catch (const api::ApiError& error) {
            send_error(res, error);
        } catch (const session::SessionNotFound&) {
            send_error(res, api::session_not_found());
        } catch (const session::ProjectNotFound&) {
            send_error(res, api::project_not_found());
        } catch (const session::FileNotFound&) {
            send_error(res, api::file_not_found());
        } catch (const std::exception& e) {
            std::cerr << "[API] " << req.method << ' ' << req.path << " failed: " << e.what() << '\n';
            send_error(res, api::internal_error());
        }
    };
}

const std::string& path_param(const httplib::Request& req, const char* name) {
    return req.path_params.at(name);
}

void require_session(session::SessionStore& sessions, const std::string& sessionId) {
    if (!sessions.has_session(sessionId))
        throw session::SessionNotFound();
}

// For operations that document 400: a malformed project ID is a bad request.
const std::string& valid_project_id(const httplib::Request& req) {
    const std::string& projectId = path_param(req, "projectId");
    if (!api::is_uuid(projectId))
        throw api::invalid_request("projectId: must be a UUID");
    return projectId;
}

// Architecture library names (bin/archs/<name>.<ext>) -> `Architecture` enum.
std::vector<std::string> documented_architectures(const std::unordered_set<std::string>& libraries) {
    std::vector<std::string> out;
    for (const auto& value : api::kArchitectures) {
        const bool available = std::any_of(libraries.begin(), libraries.end(), [&](const std::string& lib) {
            std::string upper = lib;
            std::transform(upper.begin(), upper.end(), upper.begin(), [](unsigned char c) {
                return static_cast<char>(std::toupper(c));
            });
            return upper == value;
        });
        if (available)
            out.emplace_back(value);
    }
    return out;
}

} // namespace

void Server::setup_errors() {
    // Requests that never reach an API handler (unknown route, body over the
    // size limit, malformed HTTP) still get an `Error` problem object. Bodies
    // already written by a handler (including the legacy routes) are kept.
    this->set_error_handler([](const httplib::Request&, httplib::Response& res) {
        if (!res.body.empty())
            return httplib::Server::HandlerResponse::Unhandled;

        api::ApiError error{res.status, "", httplib::status_message(res.status)};
        switch (res.status) {
            case 400: error = api::invalid_request("malformed HTTP request"); break;
            case 404: error = {404, api::error_type::NotFound, "Not found", "no such route"}; break;
            case 413:
                error = {413, api::error_type::PayloadTooLarge, "Payload too large",
                         "request body exceeds the server's size limit"};
                break;
            case 500: error = api::internal_error(); break;
            default: error.type = "http-" + std::to_string(res.status); break;
        }
        send_error(res, error);
        return httplib::Server::HandlerResponse::Handled;
    });

    this->set_exception_handler([](const httplib::Request& req, httplib::Response& res, std::exception_ptr ep) {
        try {
            if (ep)
                std::rethrow_exception(ep);
        } catch (const std::exception& e) {
            std::cerr << "[HTTP] " << req.method << ' ' << req.path << " threw: " << e.what() << '\n';
        } catch (...) {
            std::cerr << "[HTTP] " << req.method << ' ' << req.path << " threw\n";
        }
        send_error(res, api::internal_error());
    });
}

void Server::setup_http_api() {
    // The set of libraries is fixed once the simulator is constructed.
    m_architectures = documented_architectures(m_simulator.ListAvailableArchitectures());

    this->Get("/health", api_route([](const httplib::Request&, httplib::Response& res) {
        send_json(res, 200, {{"status", "ok"}});
    }));

    this->Get("/simulator/architectures", api_route([this](const httplib::Request&, httplib::Response& res) {
        send_json(res, 200, m_architectures);
    }));

    // ---------------------------------------------------------------- sessions

    this->Post("/sessions", api_route([this](const httplib::Request&, httplib::Response& res) {
        send_json(res, 201, {{"sessionId", m_sessions.create_session()}});
    }));

    this->Get("/sessions/:sessionId", api_route([this](const httplib::Request& req, httplib::Response& res) {
        const std::string& sessionId = path_param(req, "sessionId");
        require_session(m_sessions, sessionId);
        send_json(res, 200, {{"sessionId", sessionId}});
    }));

    // ---------------------------------------------------------------- projects

    this->Get("/sessions/:sessionId/projects",
              api_route([this](const httplib::Request& req, httplib::Response& res) {
                  send_json(res, 200, summaries_json(m_sessions.list_projects(path_param(req, "sessionId"))));
              }));

    this->Put("/sessions/:sessionId/projects",
              api_route([this](const httplib::Request& req, httplib::Response& res) {
                  const std::string& sessionId = path_param(req, "sessionId");
                  require_session(m_sessions, sessionId);

                  auto projects = api::parse_project_sync(api::parse_body(req.body));
                  send_json(res, 200, summaries_json(m_sessions.sync_projects(sessionId, std::move(projects))));
              }));

    this->Get("/sessions/:sessionId/projects/:projectId",
              api_route([this](const httplib::Request& req, httplib::Response& res) {
                  // A malformed projectId cannot name a stored project: 404.
                  send_json(res, 200, project_json(m_sessions.get_project(path_param(req, "sessionId"),
                                                                          path_param(req, "projectId"))));
              }));

    this->Put("/sessions/:sessionId/projects/:projectId",
              api_route([this](const httplib::Request& req, httplib::Response& res) {
                  const std::string& sessionId = path_param(req, "sessionId");
                  require_session(m_sessions, sessionId);
                  const std::string& projectId = valid_project_id(req);

                  session::StoredProject project = api::parse_project_input(api::parse_body(req.body));
                  project.id = projectId;

                  const auto [stored, created] = m_sessions.upsert_project(sessionId, std::move(project));
                  send_json(res, created ? 201 : 200, project_json(stored));
              }));

    this->Delete("/sessions/:sessionId/projects/:projectId",
                 api_route([this](const httplib::Request& req, httplib::Response& res) {
                     m_sessions.delete_project(path_param(req, "sessionId"), path_param(req, "projectId"));
                     send_no_content(res);
                 }));

    // ------------------------------------------------------------------- files

    this->Put("/sessions/:sessionId/projects/:projectId/files",
              api_route([this](const httplib::Request& req, httplib::Response& res) {
                  const std::string& sessionId = path_param(req, "sessionId");
                  require_session(m_sessions, sessionId);
                  const std::string& projectId = valid_project_id(req);

                  api::FileSync file = api::parse_file_sync(api::parse_body(req.body));
                  m_sessions.upsert_file(sessionId, projectId, file.path, std::move(file.content));
                  send_no_content(res);
              }));

    this->Delete("/sessions/:sessionId/projects/:projectId/files",
                 api_route([this](const httplib::Request& req, httplib::Response& res) {
                     const std::string& sessionId = path_param(req, "sessionId");
                     require_session(m_sessions, sessionId);
                     const std::string& projectId = valid_project_id(req);

                     const std::size_t count = req.get_param_value_count("path");
                     if (count == 0)
                         throw api::invalid_request("path: query parameter is required");
                     if (count > 1)
                         throw api::invalid_request("path: query parameter must be given once");

                     const std::string path = req.get_param_value("path");
                     if (path.empty())
                         throw api::invalid_request("path: must not be empty");
                     if (path.front() == '/')
                         throw api::invalid_request("path: must not start with '/'");
                     if (!api::is_file_path(path))
                         throw api::invalid_request(
                             "path: must be valid UTF-8 without line breaks after the first character");

                     m_sessions.delete_file(sessionId, projectId, path);
                     send_no_content(res);
                 }));
}
