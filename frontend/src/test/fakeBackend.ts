/**
 * An in-memory server that follows api_spec/openapi.yaml for sessions,
 * projects and files, exposed as a `fetch`. Tests drive the real HTTP client
 * through it and then assert on the server's state and on the requests made.
 */

export type StoredProject = {
    name: string;
    architecture: string;
    files: Record<string, string>;
    updatedAt: string;
};

export type LoggedRequest = { method: string; path: string; query: string; body: unknown };

type Problem = { type: string; status: number; title: string; detail?: string };

const problems = {
    session: { type: "session-not-found", status: 404, title: "Session not found" },
    project: { type: "project-not-found", status: 404, title: "Project not found" },
    file: { type: "file-not-found", status: 404, title: "File not found" },
} satisfies Record<string, Problem>;

export class FakeBackend {
    readonly sessions = new Map<string, Map<string, StoredProject>>();
    readonly log: LoggedRequest[] = [];
    /** When set, the next request whose "METHOD /path" matches gets this reply instead. */
    private overrides: Array<{ match: RegExp; reply: () => Response }> = [];
    private sessionCounter = 0;
    private clock = 0;
    online = true;
    /** What GET /simulator/architectures lists. */
    architectures: string[] = ["SIC", "SIC-XE"];

    constructor(readonly baseUrl = "http://localhost:8080") {}

    newSessionId(): string {
        this.sessionCounter += 1;
        return `00000000-0000-4000-8000-${String(this.sessionCounter).padStart(12, "0")}`;
    }

    /** Simulates a restart: every session is forgotten. */
    restart(): void {
        this.sessions.clear();
    }

    projectsOf(sessionId: string): Record<string, StoredProject> {
        return Object.fromEntries(this.sessions.get(sessionId) ?? []);
    }

    /** Replies to the next request matching `match` (e.g. /^PUT \/sessions\/[^/]+\/projects$/) with `reply`. */
    failNext(match: RegExp, reply: () => Response): void {
        this.overrides.push({ match, reply });
    }

    requests(pattern?: RegExp): string[] {
        return this.log.map((r) => `${r.method} ${r.path}${r.query}`).filter((line) => !pattern || pattern.test(line));
    }

    readonly fetch = (async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
        if (!this.online) throw new TypeError("Failed to fetch");

        const url = new URL(String(input));
        const method = (init.method ?? "GET").toUpperCase();
        const path = url.pathname;
        const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
        this.log.push({ method, path, query: url.search, body });

        const override = this.overrides.findIndex((candidate) => candidate.match.test(`${method} ${path}`));
        if (override >= 0) return this.overrides.splice(override, 1)[0].reply();

        return this.route(method, path, url.searchParams, body);
    }) as typeof fetch;

    private now(): string {
        this.clock += 1;
        return new Date(Date.UTC(2026, 0, 1, 0, 0, this.clock)).toISOString();
    }

    private route(method: string, path: string, query: URLSearchParams, body: unknown): Response {
        const segments = path.split("/").filter(Boolean).map(decodeURIComponent);

        if (method === "GET" && path === "/simulator/architectures") return json(200, this.architectures);

        if (method === "POST" && path === "/sessions") {
            const id = this.newSessionId();
            this.sessions.set(id, new Map());
            return json(201, { sessionId: id });
        }

        if (segments[0] !== "sessions" || !segments[1]) return json(404, { type: "not-found", status: 404, title: "Not found" });

        const sessionId = segments[1];
        const session = this.sessions.get(sessionId);
        const summary = (id: string, p: StoredProject) => ({ id, name: p.name, architecture: p.architecture, updatedAt: p.updatedAt });

        if (segments.length === 2 && method === "GET") {
            return session ? json(200, { sessionId }) : json(404, problems.session);
        }

        if (segments.length === 3 && segments[2] === "projects") {
            if (!session) return json(404, problems.session);
            if (method === "GET") return json(200, [...session].map(([id, p]) => summary(id, p)));
            if (method === "PUT") {
                const items = body as Array<{ id: string } & Omit<StoredProject, "updatedAt">>;
                session.clear();
                for (const item of items) {
                    session.set(item.id, { name: item.name, architecture: item.architecture, files: { ...item.files }, updatedAt: this.now() });
                }
                return json(200, [...session].map(([id, p]) => summary(id, p)));
            }
        }

        if (segments.length === 4 && segments[2] === "projects") {
            const projectId = segments[3];
            if (!session) return json(404, problems.session);
            const project = session.get(projectId);

            if (method === "GET") {
                return project ? json(200, { ...summary(projectId, project), files: project.files }) : json(404, problems.project);
            }
            if (method === "PUT") {
                const input = body as Omit<StoredProject, "updatedAt">;
                const stored = { name: input.name, architecture: input.architecture, files: { ...input.files }, updatedAt: this.now() };
                session.set(projectId, stored);
                return json(project ? 200 : 201, { ...summary(projectId, stored), files: stored.files });
            }
            if (method === "DELETE") {
                if (!project) return json(404, problems.project);
                session.delete(projectId);
                return new Response(null, { status: 204 });
            }
        }

        if (segments.length === 5 && segments[2] === "projects" && segments[4] === "files") {
            if (!session) return json(404, problems.session);
            const project = session.get(segments[3]);
            if (!project) return json(404, problems.project);

            if (method === "PUT") {
                const file = body as { path: string; content: string };
                project.files[file.path] = file.content;
                project.updatedAt = this.now();
                return new Response(null, { status: 204 });
            }
            if (method === "DELETE") {
                const filePath = query.get("path") ?? "";
                if (!(filePath in project.files)) return json(404, problems.file);
                delete project.files[filePath];
                project.updatedAt = this.now();
                return new Response(null, { status: 204 });
            }
        }

        return json(404, { type: "not-found", status: 404, title: "Not found" });
    }
}

export function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const sessionNotFound = () => json(404, problems.session);
