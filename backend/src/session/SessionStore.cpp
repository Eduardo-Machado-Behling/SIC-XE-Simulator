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

SessionStore::Projects& SessionStore::projects_of(const std::string& sessionId) {
    const auto it = m_sessions.find(sessionId);
    if (it == m_sessions.end())
        throw SessionNotFound();
    return it->second;
}

const SessionStore::Projects& SessionStore::projects_of(const std::string& sessionId) const {
    const auto it = m_sessions.find(sessionId);
    if (it == m_sessions.end())
        throw SessionNotFound();
    return it->second;
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
    for (;;) {
        std::string id = random_uuid_v4();
        if (m_sessions.try_emplace(id).second)
            return id;
    }
}

bool SessionStore::has_session(const std::string& sessionId) const {
    std::shared_lock lock(m_mutex);
    return m_sessions.contains(sessionId);
}

std::vector<StoredProject> SessionStore::list_projects(const std::string& sessionId) const {
    std::shared_lock lock(m_mutex);
    return summaries(projects_of(sessionId));
}

std::vector<StoredProject> SessionStore::sync_projects(const std::string& sessionId,
                                                       std::vector<StoredProject> projects) {
    const std::string updatedAt = now_rfc3339();

    Projects replacement;
    for (auto& project : projects) {
        project.updatedAt = updatedAt;
        std::string id = project.id;
        replacement.insert_or_assign(std::move(id), std::move(project));
    }

    std::unique_lock lock(m_mutex);
    Projects& current = projects_of(sessionId);
    current = std::move(replacement);
    return summaries(current);
}

StoredProject SessionStore::get_project(const std::string& sessionId,
                                        const std::string& projectId) const {
    std::shared_lock lock(m_mutex);
    const Projects& projects = projects_of(sessionId);
    const auto it = projects.find(projectId);
    if (it == projects.end())
        throw ProjectNotFound();
    return it->second;
}

std::pair<StoredProject, bool> SessionStore::upsert_project(const std::string& sessionId,
                                                            StoredProject project) {
    project.updatedAt = now_rfc3339();

    std::unique_lock lock(m_mutex);
    Projects& projects = projects_of(sessionId);
    std::string id = project.id;
    const auto [it, created] = projects.insert_or_assign(std::move(id), std::move(project));
    return {it->second, created};
}

void SessionStore::delete_project(const std::string& sessionId, const std::string& projectId) {
    std::unique_lock lock(m_mutex);
    if (projects_of(sessionId).erase(projectId) == 0)
        throw ProjectNotFound();
}

void SessionStore::upsert_file(const std::string& sessionId,
                               const std::string& projectId,
                               const std::string& path,
                               std::string content) {
    std::string updatedAt = now_rfc3339();

    std::unique_lock lock(m_mutex);
    Projects& projects = projects_of(sessionId);
    const auto it = projects.find(projectId);
    if (it == projects.end())
        throw ProjectNotFound();

    it->second.files.insert_or_assign(path, std::move(content));
    it->second.updatedAt = std::move(updatedAt);
}

void SessionStore::delete_file(const std::string& sessionId,
                               const std::string& projectId,
                               const std::string& path) {
    std::string updatedAt = now_rfc3339();

    std::unique_lock lock(m_mutex);
    Projects& projects = projects_of(sessionId);
    const auto it = projects.find(projectId);
    if (it == projects.end())
        throw ProjectNotFound();

    if (it->second.files.erase(path) == 0)
        throw FileNotFound();
    it->second.updatedAt = std::move(updatedAt);
}

} // namespace session
