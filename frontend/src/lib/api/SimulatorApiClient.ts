/**
 * Typed client for the HTTP API in api_spec/openapi.yaml (0.4.0): health,
 * architecture identifiers, sessions, projects and files.
 *
 * Hand-written rather than orval-generated: the generated fetch client
 * interpolates path segments unencoded, throws a bare SyntaxError on a bad
 * body, cannot take an injected fetch/base URL, and checks no request or
 * response. src/lib/api/openapi.contract.test.ts keeps this file honest
 * against the document instead.
 *
 * Simulator execution (step, reset, loadFile) is not part of the document and
 * stays on the WebSocket transport.
 */
import {
    assertFileSync,
    assertFilePath,
    assertProjectInput,
    assertProjectSyncItems,
    assertUuid,
    ContractViolation,
    parseApiProject,
    parseArchitectures,
    parseHealth,
    parseProblem,
    parseProjectSummaries,
    parseSession,
    toProjectInput,
    toProjectSyncItem,
    type ApiProject,
    type Architecture,
    type FileSync,
    type Health,
    type ProjectInput,
    type ProjectSummary,
    type ProjectSyncItem,
    type Session,
} from "@/lib/api/contract";
import { ApiNetworkError, ApiProblemError, ApiResponseError } from "@/lib/api/errors";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

type OperationSpec = {
    method: HttpMethod;
    /** Path template exactly as in the document. */
    path: string;
    /** Documented 2xx statuses. */
    success: readonly number[];
    /** Whether the documented success responses carry a JSON body. */
    jsonBody: boolean;
};

/** One entry per documented operation, keyed by `operationId`. */
export const OPERATIONS = {
    getHealth: { method: "GET", path: "/health", success: [200], jsonBody: true },
    listArchitectures: { method: "GET", path: "/simulator/architectures", success: [200], jsonBody: true },
    createSession: { method: "POST", path: "/sessions", success: [201], jsonBody: true },
    getSession: { method: "GET", path: "/sessions/{sessionId}", success: [200], jsonBody: true },
    listProjects: { method: "GET", path: "/sessions/{sessionId}/projects", success: [200], jsonBody: true },
    syncProjects: { method: "PUT", path: "/sessions/{sessionId}/projects", success: [200], jsonBody: true },
    getProject: { method: "GET", path: "/sessions/{sessionId}/projects/{projectId}", success: [200], jsonBody: true },
    upsertProject: { method: "PUT", path: "/sessions/{sessionId}/projects/{projectId}", success: [200, 201], jsonBody: true },
    deleteProject: { method: "DELETE", path: "/sessions/{sessionId}/projects/{projectId}", success: [204], jsonBody: false },
    upsertFile: { method: "PUT", path: "/sessions/{sessionId}/projects/{projectId}/files", success: [204], jsonBody: false },
    deleteFile: { method: "DELETE", path: "/sessions/{sessionId}/projects/{projectId}/files", success: [204], jsonBody: false },
} as const satisfies Record<string, OperationSpec>;

export type OperationId = keyof typeof OPERATIONS;

export type SimulatorApiClientOptions = {
    /** Server base URL without a trailing slash, e.g. http://localhost:8080. */
    baseUrl: string;
    /** Defaults to the global fetch, looked up on each call. */
    fetch?: typeof fetch;
};

type CallOptions = {
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
};

type Reply = { status: number; body: unknown };

export class SimulatorApiClient {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;

    constructor(options: SimulatorApiClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    }

    // ------------------------------------------------------------ operations

    async getHealth(): Promise<Health> {
        return this.parse(await this.call("getHealth"), parseHealth);
    }

    async listArchitectures(): Promise<Architecture[]> {
        return this.parse(await this.call("listArchitectures"), parseArchitectures);
    }

    async createSession(): Promise<Session> {
        return this.parse(await this.call("createSession"), parseSession);
    }

    async getSession(sessionId: string): Promise<Session> {
        assertUuid(sessionId, "sessionId");
        return this.parse(await this.call("getSession", { params: { sessionId } }), parseSession);
    }

    async listProjects(sessionId: string): Promise<ProjectSummary[]> {
        assertUuid(sessionId, "sessionId");
        return this.parse(await this.call("listProjects", { params: { sessionId } }), parseProjectSummaries);
    }

    /** Replaces the session's whole project set; returns summaries (no files). */
    async syncProjects(sessionId: string, projects: ProjectSyncItem[]): Promise<ProjectSummary[]> {
        assertUuid(sessionId, "sessionId");
        assertProjectSyncItems(projects);
        const body = projects.map(toProjectSyncItem);
        return this.parse(await this.call("syncProjects", { params: { sessionId }, body }), parseProjectSummaries);
    }

    async getProject(sessionId: string, projectId: string): Promise<ApiProject> {
        assertUuid(sessionId, "sessionId");
        assertUuid(projectId, "projectId");
        return this.parse(await this.call("getProject", { params: { sessionId, projectId } }), parseApiProject);
    }

    /** Creates (201) or replaces (200) a project. The id travels in the path only. */
    async upsertProject(
        sessionId: string,
        projectId: string,
        project: ProjectInput,
    ): Promise<{ project: ApiProject; created: boolean }> {
        assertUuid(sessionId, "sessionId");
        assertUuid(projectId, "projectId");
        assertProjectInput(project);
        const reply = await this.call("upsertProject", { params: { sessionId, projectId }, body: toProjectInput(project) });
        return { project: this.parse(reply, parseApiProject), created: reply.status === 201 };
    }

    async deleteProject(sessionId: string, projectId: string): Promise<void> {
        assertUuid(sessionId, "sessionId");
        assertUuid(projectId, "projectId");
        await this.call("deleteProject", { params: { sessionId, projectId } });
    }

    async upsertFile(sessionId: string, projectId: string, file: FileSync): Promise<void> {
        assertUuid(sessionId, "sessionId");
        assertUuid(projectId, "projectId");
        assertFileSync(file);
        await this.call("upsertFile", {
            params: { sessionId, projectId },
            body: { path: file.path, content: file.content },
        });
    }

    async deleteFile(sessionId: string, projectId: string, path: string): Promise<void> {
        assertUuid(sessionId, "sessionId");
        assertUuid(projectId, "projectId");
        assertFilePath(path);
        await this.call("deleteFile", { params: { sessionId, projectId }, query: { path } });
    }

    // -------------------------------------------------------------- plumbing

    private url(template: string, options: CallOptions): string {
        const path = template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
            const value = options.params?.[name];
            if (value === undefined) throw new Error(`missing path parameter ${name}`);
            return encodeURIComponent(value);
        });
        const query = Object.entries(options.query ?? {})
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join("&");
        return `${this.baseUrl}${path}${query ? `?${query}` : ""}`;
    }

    private async call(operationId: OperationId, options: CallOptions = {}): Promise<Reply> {
        const operation: OperationSpec = OPERATIONS[operationId];
        const headers: Record<string, string> = { Accept: "application/json" };
        const init: RequestInit = { method: operation.method, headers };

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(options.body);
        }

        let response: Response;
        try {
            response = await this.fetchImpl(this.url(operation.path, options), init);
        } catch (cause) {
            throw new ApiNetworkError(cause);
        }

        const status = response.status;
        const isSuccess = status >= 200 && status < 300;

        if (isSuccess && !operation.success.includes(status)) {
            throw new ApiResponseError(status, "unexpected-status", `${operationId} documents ${operation.success.join("/")}`);
        }

        // Documented bodyless replies (204): never read or parse a body.
        if (isSuccess && !operation.jsonBody) return { status, body: undefined };

        let text: string;
        try {
            text = await response.text();
        } catch (cause) {
            throw new ApiNetworkError(cause);
        }

        let body: unknown;
        try {
            body = JSON.parse(text);
        } catch {
            throw new ApiResponseError(status, "malformed-json", `${operationId}: body is not JSON (${text.slice(0, 120)})`);
        }

        if (isSuccess) return { status, body };

        const problem = parseProblem(body);
        if (!problem) {
            throw new ApiResponseError(status, "invalid-shape", `${operationId}: error body is not a problem object`);
        }
        throw new ApiProblemError(status, problem);
    }

    private parse<T>(reply: Reply, parser: (body: unknown) => T): T {
        try {
            return parser(reply.body);
        } catch (error) {
            if (error instanceof ContractViolation) throw new ApiResponseError(reply.status, "invalid-shape", error.message);
            throw error;
        }
    }
}
