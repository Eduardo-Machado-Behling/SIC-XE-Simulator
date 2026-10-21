#pragma once

#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstdint>
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

// A write would make the session hold more than `limit` bytes (see
// StoreLimits::maxSessionBytes). Nothing was changed.
struct StorageLimitExceeded : std::runtime_error {
    std::size_t limit;

    explicit StorageLimitExceeded(std::size_t limit)
        : std::runtime_error("session storage limit exceeded")
        , limit(limit) {}
};

// Bounds on what the store keeps in memory. Sizes are estimates: the bytes of
// every stored string plus a fixed overhead per session, project and file,
// so many empty projects or files also count.
struct StoreLimits {
    static constexpr std::size_t kSessionOverhead = 256;
    static constexpr std::size_t kProjectOverhead = 256;
    static constexpr std::size_t kFileOverhead = 64;

    // Creating a session beyond this evicts the least recently used one.
    std::size_t maxSessions = 10000;
    // A write that would make one session larger than this is rejected.
    std::size_t maxSessionBytes = 16 * 1024 * 1024;
    // A write or new session that would make the whole store larger than
    // this evicts the least recently used other sessions.
    std::size_t maxTotalBytes = 256 * 1024 * 1024;
    // A session not used for this long expires; zero means never.
    std::chrono::seconds sessionTtl{24 * 60 * 60};
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
// Sessions are issued by the server (random UUID v4). Everything is lost on
// restart, and a session also disappears when it stays idle for longer than
// StoreLimits::sessionTtl or is evicted (least recently used first) to keep
// the store within StoreLimits. The API contract allows this: clients that
// get session-not-found create a new session and re-sync.
//
// Any call that names a session counts as using it.
//
// All member functions are thread-safe: httplib serves requests on a thread
// pool, so reads take a shared lock and writes an exclusive one. Every
// function returns copies, never references into the store.
//
// Functions that take a session ID throw SessionNotFound for unknown
// sessions; project/file functions throw ProjectNotFound / FileNotFound.
// Writes that would exceed StoreLimits::maxSessionBytes throw
// StorageLimitExceeded and change nothing.
class SessionStore {
public:
    void set_limits(StoreLimits limits);
    StoreLimits limits() const;

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
    using Clock = std::chrono::steady_clock;

    struct Session {
        Projects projects;
        std::size_t bytes = StoreLimits::kSessionOverhead; // estimated size
        // Updated under the shared lock too, hence atomic.
        mutable std::atomic<std::uint64_t> lastUsedTick{0};       // LRU order
        mutable std::atomic<Clock::rep> lastUsedTime{0};          // idle expiry
    };

    // Finds a live session and marks it used; throws SessionNotFound.
    const Session& use_session(const std::string& sessionId) const;
    // Same, for writers: also erases the session if it has expired.
    Session& use_session(const std::string& sessionId);

    void touch(const Session& session) const;
    bool expired(const Session& session, Clock::time_point now) const;
    void erase_session(std::unordered_map<std::string, Session>::iterator it);
    // Erases the least recently used session other than `keep`; false if none.
    bool evict_lru(const Session* keep);
    // Evicts least recently used sessions other than `keep` until `incoming`
    // more bytes fit in StoreLimits::maxTotalBytes.
    void make_room(std::size_t incoming, const Session* keep);
    // Records the session's new size. When it grows, first checks the session
    // budget (throws StorageLimitExceeded) and makes room in the store. Call
    // before mutating so a rejected write changes nothing.
    void resize(Session& session, std::size_t newBytes);

    static std::size_t file_cost(const std::string& path, const std::string& content);
    static std::size_t project_cost(const StoredProject& project);
    static std::vector<StoredProject> summaries(const Projects& projects);

    mutable std::shared_mutex m_mutex;
    std::unordered_map<std::string, Session> m_sessions;
    std::size_t m_totalBytes = 0;
    StoreLimits m_limits;
    mutable std::atomic<std::uint64_t> m_tick{0};
};

// Current time as an RFC 3339 `date-time` in UTC, e.g. 2026-10-20T12:34:56.789Z.
std::string now_rfc3339();

// A random RFC 9562 version 4 UUID in lowercase canonical form.
std::string random_uuid_v4();

} // namespace session
