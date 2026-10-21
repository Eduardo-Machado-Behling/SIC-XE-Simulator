#pragma once

#include <map>
#include <shared_mutex>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace session {

struct SessionNotFound : std::runtime_error {
    SessionNotFound()
        : std::runtime_error("session not found") {}
};

struct ProjectNotFound : std::runtime_error {
    ProjectNotFound()
        : std::runtime_error("project not found") {}
};

struct FileNotFound : std::runtime_error {
    FileNotFound()
        : std::runtime_error("file not found") {}
};

// A project as stored for a session. `id` is chosen by the client; the
// server only sets `updatedAt` (RFC 3339, UTC, millisecond precision).
struct StoredProject {
    std::string id;
    std::string name;
    std::string architecture;
    std::map<std::string, std::string> files; // path -> content
    std::string updatedAt;
};

// In-memory, session-scoped project storage.
//
// Sessions are issued by the server (random UUID v4) and never expire while
// the process runs; everything is lost on restart, which the API contract
// allows (clients re-create the session and re-sync).
//
// All member functions are thread-safe: httplib serves requests on a thread
// pool, so reads take a shared lock and writes an exclusive one. Every
// function returns copies, never references into the store.
//
// Functions that take a session ID throw SessionNotFound for unknown
// sessions; project/file functions throw ProjectNotFound / FileNotFound.
class SessionStore {
public:
    std::string create_session();
    bool has_session(const std::string& sessionId) const;

    // Summaries (files left empty), ordered by project ID.
    std::vector<StoredProject> list_projects(const std::string& sessionId) const;

    // Replaces the whole project set of the session with `projects`
    // (IDs must be unique). Returns the resulting summaries.
    std::vector<StoredProject> sync_projects(const std::string& sessionId,
                                             std::vector<StoredProject> projects);

    StoredProject get_project(const std::string& sessionId, const std::string& projectId) const;

    // Creates or replaces the project. Returns it and whether it was created.
    std::pair<StoredProject, bool> upsert_project(const std::string& sessionId,
                                                  StoredProject project);

    void delete_project(const std::string& sessionId, const std::string& projectId);

    void upsert_file(const std::string& sessionId,
                     const std::string& projectId,
                     const std::string& path,
                     std::string content);

    void delete_file(const std::string& sessionId,
                     const std::string& projectId,
                     const std::string& path);

private:
    using Projects = std::map<std::string, StoredProject>;

    Projects& projects_of(const std::string& sessionId);
    const Projects& projects_of(const std::string& sessionId) const;

    static std::vector<StoredProject> summaries(const Projects& projects);

    mutable std::shared_mutex m_mutex;
    std::unordered_map<std::string, Projects> m_sessions;
};

// Current time as an RFC 3339 `date-time` in UTC, e.g. 2026-10-20T12:34:56.789Z.
std::string now_rfc3339();

// A random RFC 9562 version 4 UUID in lowercase canonical form.
std::string random_uuid_v4();

} // namespace session
