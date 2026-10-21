#include "session/SessionStore.hpp"

#include <array>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <ctime>
#include <mutex>
#include <random>

namespace session {

std::string now_rfc3339() {
    using namespace std::chrono;

    const auto now = system_clock::now();
    const auto millis = duration_cast<milliseconds>(now.time_since_epoch()).count() % 1000;
    const std::time_t seconds = system_clock::to_time_t(now);

    std::tm utc{};
#ifdef _WIN32
    gmtime_s(&utc, &seconds);
#else
    gmtime_r(&seconds, &utc);
#endif

    std::array<char, 32> buffer{};
    std::snprintf(buffer.data(),
                  buffer.size(),
                  "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
                  utc.tm_year + 1900,
                  utc.tm_mon + 1,
                  utc.tm_mday,
                  utc.tm_hour,
                  utc.tm_min,
                  utc.tm_sec,
                  static_cast<int>(millis));
    return buffer.data();
}

std::string random_uuid_v4() {
    // std::random_device is backed by the OS CSPRNG on the supported
    // toolchains (arc4random / getrandom / rand_s). Session IDs are bearer
    // secrets, so a seeded PRNG would not be acceptable here.
    static std::mutex mutex;
    static std::random_device device;

    std::array<std::uint8_t, 16> bytes{};
    {
        std::lock_guard<std::mutex> lock(mutex);
        for (std::size_t i = 0; i < bytes.size(); i += 4) {
            const std::uint32_t r = device();
            bytes[i] = static_cast<std::uint8_t>(r);
            bytes[i + 1] = static_cast<std::uint8_t>(r >> 8);
            bytes[i + 2] = static_cast<std::uint8_t>(r >> 16);
            bytes[i + 3] = static_cast<std::uint8_t>(r >> 24);
        }
    }

    bytes[6] = static_cast<std::uint8_t>((bytes[6] & 0x0F) | 0x40); // version 4
    bytes[8] = static_cast<std::uint8_t>((bytes[8] & 0x3F) | 0x80); // RFC 9562 variant

    static constexpr char hex[] = "0123456789abcdef";
    std::string out;
    out.reserve(36);
    for (std::size_t i = 0; i < bytes.size(); ++i) {
        if (i == 4 || i == 6 || i == 8 || i == 10)
            out.push_back('-');
        out.push_back(hex[bytes[i] >> 4]);
        out.push_back(hex[bytes[i] & 0x0F]);
    }
    return out;
}

// --------------------------------------------------------------------------

void SessionStore::set_limits(StoreLimits limits) {
    // A single session must always fit in the store once the others are gone.
    if (limits.maxTotalBytes < StoreLimits::kSessionOverhead)
        limits.maxTotalBytes = StoreLimits::kSessionOverhead;
    if (limits.maxSessionBytes > limits.maxTotalBytes)
        limits.maxSessionBytes = limits.maxTotalBytes;
    if (limits.maxSessions == 0)
        limits.maxSessions = 1;

    std::unique_lock lock(m_mutex);
    m_limits = limits;
}

void SessionStore::touch(const Session& session) const {
    session.lastUsedTick.store(m_tick.fetch_add(1, std::memory_order_relaxed) + 1, std::memory_order_relaxed);
    session.lastUsedTime.store(Clock::now().time_since_epoch().count(), std::memory_order_relaxed);
}

bool SessionStore::expired(const Session& session, Clock::time_point now) const {
    if (m_limits.sessionTtl.count() <= 0)
        return false;
    const Clock::time_point lastUsed{Clock::duration{session.lastUsedTime.load(std::memory_order_relaxed)}};
    // Compared in seconds so a huge TTL cannot overflow the clock's period.
    return std::chrono::duration_cast<std::chrono::seconds>(now - lastUsed) >= m_limits.sessionTtl;
}

const SessionStore::Session& SessionStore::use_session(const std::string& sessionId) const {
    const auto it = m_sessions.find(sessionId);
    if (it == m_sessions.end() || expired(it->second, Clock::now()))
        throw SessionNotFound();
    touch(it->second);
    return it->second;
}

SessionStore::Session& SessionStore::use_session(const std::string& sessionId) {
    const auto it = m_sessions.find(sessionId);
    if (it == m_sessions.end())
        throw SessionNotFound();
    if (expired(it->second, Clock::now())) {
        erase_session(it);
        throw SessionNotFound();
    }
    touch(it->second);
    return it->second;
}

void SessionStore::erase_session(std::unordered_map<std::string, Session>::iterator it) {
    m_totalBytes -= it->second.bytes;
    m_sessions.erase(it);
}

bool SessionStore::evict_lru(const Session* keep) {
    auto victim = m_sessions.end();
    for (auto it = m_sessions.begin(); it != m_sessions.end(); ++it) {
        if (&it->second == keep)
            continue;
        if (victim == m_sessions.end() ||
            it->second.lastUsedTick.load(std::memory_order_relaxed) <
                victim->second.lastUsedTick.load(std::memory_order_relaxed))
            victim = it;
    }
    if (victim == m_sessions.end())
        return false;
    erase_session(victim);
    return true;
}

void SessionStore::make_room(std::size_t incoming, const Session* keep) {
    // Stops when only `keep` is left; it fits since maxSessionBytes <= maxTotalBytes.
    while (m_totalBytes + incoming > m_limits.maxTotalBytes && evict_lru(keep)) {
    }
}

void SessionStore::resize(Session& session, std::size_t newBytes) {
    if (newBytes > session.bytes) {
        if (newBytes > m_limits.maxSessionBytes)
            throw StorageLimitExceeded(m_limits.maxSessionBytes);
        make_room(newBytes - session.bytes, &session);
    }
    m_totalBytes = m_totalBytes - session.bytes + newBytes;
    session.bytes = newBytes;
}

std::size_t SessionStore::file_cost(const std::string& path, const std::string& content) {
    return StoreLimits::kFileOverhead + path.size() + content.size();
}

std::size_t SessionStore::project_cost(const StoredProject& project) {
    std::size_t bytes = StoreLimits::kProjectOverhead + project.id.size() + project.name.size() +
                        project.architecture.size() + project.updatedAt.size();
    for (const auto& [path, content] : project.files)
        bytes += file_cost(path, content);
    return bytes;
}

std::vector<StoredProject> SessionStore::summaries(const Projects& projects) {
    std::vector<StoredProject> out;
    out.reserve(projects.size());
    for (const auto& [id, project] : projects)
        out.push_back({project.id, project.name, project.architecture, {}, project.updatedAt});
    return out;
}

std::string SessionStore::create_session() {
    std::unique_lock lock(m_mutex);

    const auto now = Clock::now();
    for (auto it = m_sessions.begin(); it != m_sessions.end();) {
        if (expired(it->second, now)) {
            m_totalBytes -= it->second.bytes;
            it = m_sessions.erase(it); // expired: same as erase_session()
        } else {
            ++it;
        }
    }

    while (m_sessions.size() >= m_limits.maxSessions && evict_lru(nullptr)) {
    }
    make_room(StoreLimits::kSessionOverhead, nullptr);

    for (;;) {
        std::string id = random_uuid_v4();
        const auto [it, created] = m_sessions.try_emplace(id);
        if (!created)
            continue;
        m_totalBytes += it->second.bytes;
        touch(it->second);
        return id;
    }
}

bool SessionStore::has_session(const std::string& sessionId) const {
    std::shared_lock lock(m_mutex);
    try {
        use_session(sessionId);
        return true;
    } catch (const SessionNotFound&) {
        return false;
    }
}

std::vector<StoredProject> SessionStore::list_projects(const std::string& sessionId) const {
    std::shared_lock lock(m_mutex);
    return summaries(use_session(sessionId).projects);
}

std::vector<StoredProject> SessionStore::sync_projects(const std::string& sessionId,
                                                       std::vector<StoredProject> projects) {
    const std::string updatedAt = now_rfc3339();

    Projects replacement;
    std::size_t bytes = StoreLimits::kSessionOverhead;
    for (auto& project : projects) {
        project.updatedAt = updatedAt;
        bytes += project_cost(project);
        std::string id = project.id;
        replacement.insert_or_assign(std::move(id), std::move(project));
    }

    std::unique_lock lock(m_mutex);
    Session& session = use_session(sessionId);
    resize(session, bytes);
    session.projects = std::move(replacement);
    return summaries(session.projects);
}

StoredProject SessionStore::get_project(const std::string& sessionId,
                                        const std::string& projectId) const {
    std::shared_lock lock(m_mutex);
    const Projects& projects = use_session(sessionId).projects;
    const auto it = projects.find(projectId);
    if (it == projects.end())
        throw ProjectNotFound();
    return it->second;
}

std::pair<StoredProject, bool> SessionStore::upsert_project(const std::string& sessionId,
                                                            StoredProject project) {
    project.updatedAt = now_rfc3339();
    const std::size_t cost = project_cost(project);

    std::unique_lock lock(m_mutex);
    Session& session = use_session(sessionId);
    const auto existing = session.projects.find(project.id);
    const std::size_t old = existing == session.projects.end() ? 0 : project_cost(existing->second);
    resize(session, session.bytes - old + cost);

    std::string id = project.id;
    const auto [it, created] = session.projects.insert_or_assign(std::move(id), std::move(project));
    return {it->second, created};
}

void SessionStore::delete_project(const std::string& sessionId, const std::string& projectId) {
    std::unique_lock lock(m_mutex);
    Session& session = use_session(sessionId);
    const auto it = session.projects.find(projectId);
    if (it == session.projects.end())
        throw ProjectNotFound();
    resize(session, session.bytes - project_cost(it->second));
    session.projects.erase(it);
}

void SessionStore::upsert_file(const std::string& sessionId,
                               const std::string& projectId,
                               const std::string& path,
                               std::string content) {
    std::string updatedAt = now_rfc3339();

    std::unique_lock lock(m_mutex);
    Session& session = use_session(sessionId);
    const auto it = session.projects.find(projectId);
    if (it == session.projects.end())
        throw ProjectNotFound();

    auto& files = it->second.files;
    const auto file = files.find(path);
    const std::size_t old = file == files.end() ? 0 : file_cost(path, file->second);
    resize(session, session.bytes - old + file_cost(path, content));

    files.insert_or_assign(path, std::move(content));
    it->second.updatedAt = std::move(updatedAt);
}

void SessionStore::delete_file(const std::string& sessionId,
                               const std::string& projectId,
                               const std::string& path) {
    std::string updatedAt = now_rfc3339();

    std::unique_lock lock(m_mutex);
    Session& session = use_session(sessionId);
    const auto it = session.projects.find(projectId);
    if (it == session.projects.end())
        throw ProjectNotFound();

    auto& files = it->second.files;
    const auto file = files.find(path);
    if (file == files.end())
        throw FileNotFound();
    resize(session, session.bytes - file_cost(path, file->second));
    files.erase(file);
    it->second.updatedAt = std::move(updatedAt);
}

} // namespace session
