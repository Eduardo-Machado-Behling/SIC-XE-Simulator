import { describe, expect, it } from "vitest";

import { SimulatorApiClient } from "@/lib/api/SimulatorApiClient";
import {
    ApiNetworkError,
    ApiProblemError,
    ApiResponseError,
    ApiValidationError,
    isSessionNotFound,
} from "@/lib/api/errors";

const BASE = "http://localhost:8080";
const SESSION = "3f2b8c1e-7a4d-4e9b-9c55-1d2a6b0f8e33";
const PROJECT = "550e8400-e29b-41d4-a716-446655440000";
const UPDATED = "2026-10-20T12:00:00.000Z";

type Call = { url: string; method: string; headers: Headers; body: string | null };

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function raw(status: number, body: string | null): Response {
    return new Response(body, { status });
}

/** A fetch double that records each request and answers from a queue. */
function fakeFetch(...responses: Array<Response | Error>) {
    const calls: Call[] = [];
    const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push({
            url: String(input),
            method: init.method ?? "GET",
            headers: new Headers(init.headers),
            body: typeof init.body === "string" ? init.body : null,
        });
        const next = responses.shift();
        if (!next) throw new Error("unexpected request");
        if (next instanceof Error) throw next;
        return next;
    };
    return { fetch: fetch as typeof globalThis.fetch, calls };
}

function client(...responses: Array<Response | Error>) {
    const { fetch, calls } = fakeFetch(...responses);
    return { api: new SimulatorApiClient({ baseUrl: BASE, fetch }), calls };
}

const PROJECT_BODY = {
    id: PROJECT,
    name: "Hello",
    architecture: "SIC-XE",
    updatedAt: UPDATED,
    files: { "main.asm": "END" },
};

describe("SimulatorApiClient requests", () => {
    it("creates a session with POST /sessions and no body, expecting 201", async () => {
        const { api, calls } = client(json(201, { sessionId: SESSION }));

        await expect(api.createSession()).resolves.toEqual({ sessionId: SESSION });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("http://localhost:8080/sessions");
        expect(calls[0].method).toBe("POST");
        expect(calls[0].body).toBeNull();
        expect(calls[0].headers.get("Accept")).toBe("application/json");
        expect(calls[0].headers.get("Content-Type")).toBeNull();
    });

    it("validates a session with GET /sessions/{sessionId}", async () => {
        const { api, calls } = client(json(200, { sessionId: SESSION }));

        await expect(api.getSession(SESSION)).resolves.toEqual({ sessionId: SESSION });
        expect(calls[0]).toMatchObject({ method: "GET", url: `${BASE}/sessions/${SESSION}` });
    });

    it("lists projects as summaries with GET /sessions/{sessionId}/projects", async () => {
        const summary = { id: PROJECT, name: "Hello", architecture: "SIC", updatedAt: UPDATED };
        const { api, calls } = client(json(200, [summary]));

        await expect(api.listProjects(SESSION)).resolves.toEqual([summary]);
        expect(calls[0]).toMatchObject({ method: "GET", url: `${BASE}/sessions/${SESSION}/projects` });
    });

    it("bulk-syncs ProjectSyncItem[] with PUT /sessions/{sessionId}/projects", async () => {
        const items = [
            { id: PROJECT, name: "Hello", architecture: "SIC-XE" as const, files: { "main.asm": "END", "src/a.asm": "" } },
        ];
        const { api, calls } = client(json(200, [{ id: PROJECT, name: "Hello", architecture: "SIC-XE", updatedAt: UPDATED }]));

        const result = await api.syncProjects(SESSION, items);

        expect(result).toEqual([{ id: PROJECT, name: "Hello", architecture: "SIC-XE", updatedAt: UPDATED }]);
        expect(calls[0]).toMatchObject({ method: "PUT", url: `${BASE}/sessions/${SESSION}/projects` });
        expect(calls[0].headers.get("Content-Type")).toBe("application/json");
        expect(JSON.parse(calls[0].body!)).toEqual([
            { id: PROJECT, name: "Hello", architecture: "SIC-XE", files: { "main.asm": "END", "src/a.asm": "" } },
        ]);
    });

    it("sends an empty array when there is nothing to sync", async () => {
        const { api, calls } = client(json(200, []));

        await expect(api.syncProjects(SESSION, [])).resolves.toEqual([]);
        expect(calls[0].body).toBe("[]");
    });

    it("fetches a full project with GET /sessions/{sessionId}/projects/{projectId}", async () => {
        const { api, calls } = client(json(200, PROJECT_BODY));

        await expect(api.getProject(SESSION, PROJECT)).resolves.toEqual(PROJECT_BODY);
        expect(calls[0]).toMatchObject({ method: "GET", url: `${BASE}/sessions/${SESSION}/projects/${PROJECT}` });
    });

    it("upserts a project with a ProjectInput body (no id) and reports 201 as created", async () => {
        const { api, calls } = client(json(201, PROJECT_BODY));

        const result = await api.upsertProject(SESSION, PROJECT, {
            name: "Hello",
            architecture: "SIC-XE",
            files: { "main.asm": "END" },
        });

        expect(result).toEqual({ project: PROJECT_BODY, created: true });
        expect(calls[0]).toMatchObject({ method: "PUT", url: `${BASE}/sessions/${SESSION}/projects/${PROJECT}` });
        expect(JSON.parse(calls[0].body!)).toEqual({ name: "Hello", architecture: "SIC-XE", files: { "main.asm": "END" } });
    });

    it("strips an id from the upsert body because the id belongs in the path", async () => {
        const { api, calls } = client(json(200, PROJECT_BODY));

        const input = { id: PROJECT, name: "Hello", architecture: "SIC-XE" as const, files: {} };
        const result = await api.upsertProject(SESSION, PROJECT, input);

        expect(result.created).toBe(false);
        expect(JSON.parse(calls[0].body!)).toEqual({ name: "Hello", architecture: "SIC-XE", files: {} });
    });

    it("deletes a project with DELETE and accepts a bodyless 204", async () => {
        const { api, calls } = client(raw(204, null));

        await expect(api.deleteProject(SESSION, PROJECT)).resolves.toBeUndefined();
        expect(calls[0]).toMatchObject({ method: "DELETE", url: `${BASE}/sessions/${SESSION}/projects/${PROJECT}`, body: null });
    });

    it("upserts a file with PUT .../files and a { path, content } body", async () => {
        const { api, calls } = client(raw(204, null));

        await expect(api.upsertFile(SESSION, PROJECT, { path: "src/main.asm", content: "LDA #1" })).resolves.toBeUndefined();
        expect(calls[0]).toMatchObject({ method: "PUT", url: `${BASE}/sessions/${SESSION}/projects/${PROJECT}/files` });
        expect(JSON.parse(calls[0].body!)).toEqual({ path: "src/main.asm", content: "LDA #1" });
    });

    it("deletes a file with the path query parameter percent-encoded", async () => {
        const { api, calls } = client(raw(204, null));

        await api.deleteFile(SESSION, PROJECT, "src/my file&x=1+2.asm");

        expect(calls[0].method).toBe("DELETE");
        expect(calls[0].url).toBe(
            `${BASE}/sessions/${SESSION}/projects/${PROJECT}/files?path=src%2Fmy%20file%26x%3D1%2B2.asm`,
        );
        expect(new URL(calls[0].url).searchParams.get("path")).toBe("src/my file&x=1+2.asm");
    });

    it("lists architecture identifiers and checks health", async () => {
        const { api, calls } = client(json(200, ["SIC", "SIC-XE"]), json(200, { status: "ok" }));

        await expect(api.listArchitectures()).resolves.toEqual(["SIC", "SIC-XE"]);
        await expect(api.getHealth()).resolves.toEqual({ status: "ok" });
        expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
            `GET ${BASE}/simulator/architectures`,
            `GET ${BASE}/health`,
        ]);
    });

    it("keeps a path prefix of the configured server", async () => {
        const { fetch, calls } = fakeFetch(json(201, { sessionId: SESSION }));
        const api = new SimulatorApiClient({ baseUrl: "https://example.org/api/", fetch });

        await api.createSession();
        expect(calls[0].url).toBe("https://example.org/api/sessions");
    });
});

describe("SimulatorApiClient validation before sending", () => {
    it.each([
        ["a malformed session id", (api: SimulatorApiClient) => api.getSession("0")],
        ["a malformed project id", (api: SimulatorApiClient) => api.getProject(SESSION, "../x")],
        ["a leading-slash file path", (api: SimulatorApiClient) => api.upsertFile(SESSION, PROJECT, { path: "/main.asm", content: "" })],
        ["an empty file path", (api: SimulatorApiClient) => api.deleteFile(SESSION, PROJECT, "")],
        ["a leading-slash delete path", (api: SimulatorApiClient) => api.deleteFile(SESSION, PROJECT, "/main.asm")],
        [
            "an unknown architecture",
            (api: SimulatorApiClient) =>
                api.upsertProject(SESSION, PROJECT, { name: "x", architecture: "sic-xe" as never, files: {} }),
        ],
        [
            "a sync item without a UUID",
            (api: SimulatorApiClient) => api.syncProjects(SESSION, [{ id: "0", name: "x", architecture: "SIC", files: {} }]),
        ],
        [
            "non-string file content",
            (api: SimulatorApiClient) => api.upsertFile(SESSION, PROJECT, { path: "a.asm", content: 1 as never }),
        ],
    ])("rejects %s without calling the server", async (_label, call) => {
        const { api, calls } = client();

        await expect(call(api)).rejects.toBeInstanceOf(ApiValidationError);
        expect(calls).toHaveLength(0);
    });
});

describe("SimulatorApiClient responses and errors", () => {
    it("keeps every field of a session-not-found problem", async () => {
        const { api } = client(json(404, { type: "session-not-found", status: 404, title: "Session not found" }));

        const error = await api.listProjects(SESSION).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiProblemError);
        expect(error).toMatchObject({ httpStatus: 404, status: 404, type: "session-not-found", title: "Session not found" });
        expect(isSessionNotFound(error)).toBe(true);
    });

    it.each(["project-not-found", "file-not-found", undefined])("does not treat a 404 of type %j as an expired session", async (type) => {
        const { api } = client(json(404, { type, status: 404, title: "Not found" }));

        const error = await api.getProject(SESSION, PROJECT).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiProblemError);
        expect(isSessionNotFound(error)).toBe(false);
    });

    it("does not treat a session-not-found type on another status as an expired session", async () => {
        const { api } = client(json(500, { type: "session-not-found", status: 500, title: "Odd" }));

        expect(isSessionNotFound(await api.getSession(SESSION).catch((e: unknown) => e))).toBe(false);
    });

    it.each([
        [400, { type: "invalid-request", status: 400, title: "Invalid request", detail: "files: path must not start with '/'" }],
        [413, { type: "payload-too-large", status: 413, title: "Payload too large", detail: "request body exceeds the server's size limit" }],
        [500, { type: "internal-error", status: 500, title: "Internal server error" }],
    ])("surfaces a %i problem with its type, status, title and detail", async (status, problem) => {
        const { api } = client(json(status, problem));

        const error = await api.syncProjects(SESSION, []).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiProblemError);
        expect(error).toMatchObject({ httpStatus: status, ...problem });
        expect((error as Error).message).toContain(problem.title);
    });

    it("rejects malformed JSON on a success response and keeps the HTTP status", async () => {
        const { api } = client(raw(201, "{not json"));

        const error = await api.createSession().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiResponseError);
        expect(error).toMatchObject({ reason: "malformed-json", httpStatus: 201 });
    });

    it("rejects a non-problem error body without hiding the HTTP status", async () => {
        const { api } = client(raw(502, "<html>Bad gateway</html>"));

        const error = await api.getHealth().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiResponseError);
        expect(error).toMatchObject({ reason: "malformed-json", httpStatus: 502 });
    });

    it("rejects a success body that does not match the documented schema", async () => {
        const { api } = client(json(201, { session: SESSION }));

        const error = await api.createSession().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiResponseError);
        expect(error).toMatchObject({ reason: "invalid-shape", httpStatus: 201 });
    });

    it("rejects an undocumented success status", async () => {
        const { api } = client(json(200, { sessionId: SESSION }));

        const error = await api.createSession().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiResponseError);
        expect(error).toMatchObject({ reason: "unexpected-status", httpStatus: 200 });
    });

    it("rejects a 200 where the contract promises a bodyless 204", async () => {
        const { api } = client(json(200, {}));

        await expect(api.deleteProject(SESSION, PROJECT)).rejects.toMatchObject({ reason: "unexpected-status", httpStatus: 200 });
    });

    it("wraps network failures", async () => {
        const failure = new TypeError("Failed to fetch");
        const { api } = client(failure);

        const error = await api.createSession().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiNetworkError);
        expect((error as ApiNetworkError).cause).toBe(failure);
    });
});
