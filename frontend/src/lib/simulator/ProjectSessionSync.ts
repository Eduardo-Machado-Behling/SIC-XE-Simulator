import type { Project } from "@/lib/simulator/Project";
import { simulatorBaseUrl } from "@/lib/transport/urls";

const SESSION_COOKIE = "sicxe_session";
const SESSION_MAX_AGE = 24 * 60 * 60;
const PROJECTS_STORAGE_KEY = "sicxe-projects-v1";
const PROJECT_ID_ALIASES_KEY = "sicxe-project-id-aliases-v1";

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readProjectIdAliases(): Record<string, string> {
    try {
        const value = JSON.parse(localStorage.getItem(PROJECT_ID_ALIASES_KEY) ?? "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
}

function baseUrl(): string {
    const configured = simulatorBaseUrl();
    return configured.includes("://") ? configured.replace(/\/$/, "") : `http://${configured}`;
}

function cookieValue(name: string): string | null {
    const prefix = `${name}=`;
    const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : null;
}

function saveSessionCookie(sessionId: string): void {
    document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Max-Age=${SESSION_MAX_AGE}; Path=/; SameSite=Lax`;
}

export function readStoredProjects(): Project[] {
    try {
        const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
        if (!raw) return [];
        const value = JSON.parse(raw) as unknown;
        if (!Array.isArray(value)) return [];
        const aliases = readProjectIdAliases();
        let migrated = false;
        const projects = value.filter((project): project is Project =>
            project !== null && typeof project === "object" &&
            typeof project.id === "string" && typeof project.name === "string" &&
            typeof project.architecture === "string" && project.files !== null &&
            typeof project.files === "object" && !Array.isArray(project.files),
        );
        for (const project of projects) {
            if (isUuid(project.id)) continue;
            const previousId = project.id;
            project.id = aliases[previousId] ?? crypto.randomUUID();
            aliases[previousId] = project.id;
            migrated = true;
        }
        if (migrated) {
            localStorage.setItem(PROJECT_ID_ALIASES_KEY, JSON.stringify(aliases));
            saveStoredProjects(projects);
        }
        return projects;
    } catch {
        return [];
    }
}

export function saveStoredProjects(projects: Project[]): void {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

export function saveStoredProject(project: Project): Project[] {
    const projects = readStoredProjects();
    const index = projects.findIndex((item) => item.id === project.id);
    if (index < 0) projects.push(project);
    else projects[index] = project;
    saveStoredProjects(projects);
    return projects;
}

export function getStoredProject(projectId: string): Project | null {
    const projects = readStoredProjects();
    const canonicalId = readProjectIdAliases()[projectId] ?? projectId;
    return projects.find((project) => project.id === canonicalId) ?? null;
}

async function createSession(): Promise<string> {
    const response = await fetch(`${baseUrl()}/sessions`, { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error(`Could not reserve a project session (HTTP ${response.status}).`);
    const body = await response.json() as { sessionId?: unknown };
    if (typeof body.sessionId !== "string" || !body.sessionId) throw new Error("The server returned an invalid project session.");
    saveSessionCookie(body.sessionId);
    return body.sessionId;
}

export async function getOrCreateProjectSession(): Promise<string> {
    const existing = cookieValue(SESSION_COOKIE);
    if (existing) {
        const response = await fetch(`${baseUrl()}/sessions/${encodeURIComponent(existing)}`, { cache: "no-store" });
        if (response.ok) {
            saveSessionCookie(existing);
            return existing;
        }
        if (response.status !== 404) throw new Error(`Could not validate the project session (HTTP ${response.status}).`);
    }
    return createSession();
}

async function putProjectSet(sessionId: string, projects: Project[]): Promise<Response> {
    return fetch(`${baseUrl()}/sessions/${encodeURIComponent(sessionId)}/projects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projects),
    });
}

/** Bulk-syncs the browser's complete project set to its session mirror. */
export async function syncProjectsToSession(projects = readStoredProjects()): Promise<string> {
    let sessionId = await getOrCreateProjectSession();
    let response = await putProjectSet(sessionId, projects);

    if (response.status === 404) {
        const body = await response.clone().json().catch(() => null) as { type?: string } | null;
        if (body?.type === "session-not-found") {
            sessionId = await createSession();
            response = await putProjectSet(sessionId, projects);
        }
    }

    if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
        throw new Error(body?.detail || body?.title || `Could not sync projects (HTTP ${response.status}).`);
    }
    return sessionId;
}

/** Saves locally first, then makes the full project set available to the simulator session. */
export async function syncProjectToSession(project: Project): Promise<string> {
    const projects = saveStoredProject(project);
    return syncProjectsToSession(projects);
}
