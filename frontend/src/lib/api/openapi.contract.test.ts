/**
 * Contract-level check: the HTTP client against api_spec/openapi.yaml itself.
 * The fetch double in src/test/openapi.ts is derived from the document, so a
 * change to the document (or to the client) that breaks the other fails here.
 * WebSocket execution is outside the document and is tested separately in
 * src/lib/transport/WebTransport.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { OPERATIONS, SimulatorApiClient } from "@/lib/api/SimulatorApiClient";
import { ARCHITECTURES } from "@/lib/api/contract";
import { ApiProblemError, isSessionNotFound } from "@/lib/api/errors";
import {
    createSpecFetch,
    deref,
    listOperations,
    loadSpec,
    sample,
    validate,
    type OpenApiDocument,
} from "@/test/openapi";

const BASE = "http://localhost:8080";
const SESSION = "3f2b8c1e-7a4d-4e9b-9c55-1d2a6b0f8e33";
const PROJECT = "550e8400-e29b-41d4-a716-446655440000";

let spec: OpenApiDocument;

beforeAll(() => {
    spec = loadSpec();
});

function responseSchema(operationId: string, status: number) {
    const op = listOperations(spec).find((candidate) => candidate.operationId === operationId)!;
    const response = deref(spec, op.operation.responses[String(status)]);
    return response.content?.["application/json"]?.schema;
}

describe("OpenAPI document helpers (sanity, so the contract checks cannot pass vacuously)", () => {
    it("reads the documented servers, including local development", () => {
        expect(spec.servers.map((server: { url: string }) => server.url)).toContain("http://localhost:8080");
    });

    it("rejects values the document forbids", () => {
        const fileSync = spec.components.schemas.FileSync;
        expect(validate(spec, fileSync, { path: "main.asm", content: "" })).toEqual([]);
        expect(validate(spec, fileSync, { path: "/main.asm", content: "" })).not.toEqual([]);
        expect(validate(spec, fileSync, { filePath: "main.asm", content: "" })).not.toEqual([]);
        expect(validate(spec, spec.components.schemas.ProjectSyncItem, { name: "a", architecture: "SIC", files: {} })).not.toEqual([]);
        expect(validate(spec, spec.components.schemas.ProjectInput, { id: PROJECT, name: "a", architecture: "SIC", files: {} }, "$", { strict: true })).not.toEqual([]);
    });

    it("generates samples that satisfy their own schemas", () => {
        for (const name of Object.keys(spec.components.schemas)) {
            const schema = spec.components.schemas[name];
            expect(validate(spec, schema, sample(spec, schema)), name).toEqual([]);
        }
    });

    it("refuses undocumented routes such as the legacy ones", async () => {
        const { fetch, violations } = createSpecFetch(spec, { baseUrl: BASE });

        await fetch(`${BASE}/projects`);
        await fetch(`${BASE}/project`, { method: "PUT", body: "{}" });
        await fetch(`${BASE}/simulator/project/file`, { method: "PUT", body: "{}" });

        expect(violations).toHaveLength(3);
    });
});

describe("client operation table matches the document", () => {
    it("covers exactly the documented operations with the documented method and path", () => {
        const documented = Object.fromEntries(
            listOperations(spec).map((op) => [op.operationId, { method: op.method, path: op.path }]),
        );
        const implemented = Object.fromEntries(
            Object.entries(OPERATIONS).map(([id, op]) => [id, { method: op.method, path: op.path }]),
        );

        expect(implemented).toEqual(documented);
    });

    it("accepts exactly the documented success statuses and expects a body only where one is documented", () => {
        for (const op of listOperations(spec)) {
            const success = Object.keys(op.operation.responses)
                .map(Number)
                .filter((code) => code >= 200 && code < 300)
                .sort();
            const implemented = OPERATIONS[op.operationId as keyof typeof OPERATIONS];

            expect([...implemented.success].sort(), op.operationId).toEqual(success);
            for (const code of success) {
                expect(implemented.jsonBody, `${op.operationId} ${code}`).toBe(responseSchema(op.operationId, code) !== undefined);
            }
        }
    });

    it("uses the documented architecture identifiers", () => {
        expect([...ARCHITECTURES]).toEqual(spec.components.schemas.Architecture.enum);
    });
});

describe("client against a server derived from the document", () => {
    function setup(statusFor?: (operationId: string) => number | undefined) {
        const specFetch = createSpecFetch(spec, { baseUrl: BASE, statusFor });
        return { ...specFetch, api: new SimulatorApiClient({ baseUrl: BASE, fetch: specFetch.fetch }) };
    }

    it("calls every documented operation with valid paths, queries and bodies, and accepts the documented replies", async () => {
        const { api, requests, violations } = setup();
        const input = { name: "Hello", architecture: "SIC-XE" as const, files: { "main.asm": " END", "src/data.asm": "" } };

        const results = {
            getHealth: await api.getHealth(),
            listArchitectures: await api.listArchitectures(),
            createSession: await api.createSession(),
            getSession: await api.getSession(SESSION),
            listProjects: await api.listProjects(SESSION),
            syncProjects: await api.syncProjects(SESSION, [{ id: PROJECT, ...input }]),
            getProject: await api.getProject(SESSION, PROJECT),
            upsertProject: (await api.upsertProject(SESSION, PROJECT, input)).project,
            deleteProject: await api.deleteProject(SESSION, PROJECT),
            upsertFile: await api.upsertFile(SESSION, PROJECT, { path: "src/data.asm", content: "WORD 1" }),
            deleteFile: await api.deleteFile(SESSION, PROJECT, "src/data file.asm"),
        };

        expect(violations).toEqual([]);
        expect(requests.map((request) => request.operationId).sort()).toEqual(Object.keys(OPERATIONS).sort());

        for (const [operationId, value] of Object.entries(results)) {
            const op = OPERATIONS[operationId as keyof typeof OPERATIONS];
            const schema = responseSchema(operationId, op.success[0]);
            if (schema) expect(validate(spec, schema, value), operationId).toEqual([]);
            else expect(value, operationId).toBeUndefined();
        }

        const deleteFile = requests.find((request) => request.operationId === "deleteFile")!;
        expect(deleteFile.query.get("path")).toBe("src/data file.asm");
    });

    it("treats both documented upsert statuses as success", async () => {
        for (const status of [200, 201]) {
            const { api, violations } = setup((id) => (id === "upsertProject" ? status : undefined));

            const result = await api.upsertProject(SESSION, PROJECT, { name: "a", architecture: "SIC", files: {} });

            expect(violations).toEqual([]);
            expect(result.created).toBe(status === 201);
        }
    });

    it.each([
        ["getSession", 404, true],
        ["listProjects", 404, true],
        ["getProject", 404, false],
        ["upsertFile", 400, false],
    ])("surfaces the documented %s %i problem example (session expiry: %s)", async (operationId, status, sessionExpired) => {
        const { api } = setup((id) => (id === operationId ? status : undefined));
        const calls: Record<string, () => Promise<unknown>> = {
            getSession: () => api.getSession(SESSION),
            listProjects: () => api.listProjects(SESSION),
            getProject: () => api.getProject(SESSION, PROJECT),
            upsertFile: () => api.upsertFile(SESSION, PROJECT, { path: "main.asm", content: "" }),
        };
        const op = listOperations(spec).find((candidate) => candidate.operationId === operationId)!;
        const example = deref(spec, op.operation.responses[String(status)]).content["application/json"].example;

        const error = await calls[operationId]().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiProblemError);
        expect(error).toMatchObject({ httpStatus: status, ...example });
        expect(isSessionNotFound(error)).toBe(sessionExpired);
    });
});
