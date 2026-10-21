import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SimulatorApiClient } from "@/lib/api/SimulatorApiClient";
import { ApiValidationError } from "@/lib/api/errors";
import { LocalProjectStore } from "@/lib/projects/LocalProjectStore";
import { ProjectSync, type SyncStatus } from "@/lib/projects/ProjectSync";
import { createMemorySessionStore, type SessionIdStore } from "@/lib/session/sessionCookie";
import { FakeBackend, json, sessionNotFound } from "@/test/fakeBackend";
import type { Project } from "@/lib/simulator/Project";

const A = "550e8400-e29b-41d4-a716-446655440000";
const B = "6f1c2d3e-4b5a-4c6d-8e7f-001122334455";
const NEW_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const helloA: Project = { id: A, name: "Hello", architecture: "SIC-XE", files: { "main.asm": "END", "src/data.asm": "WORD 1" } };
const otherB: Project = { id: B, name: "Other", architecture: "SIC", files: {} };

type Setup = {
    backend: FakeBackend;
    store: LocalProjectStore;
    session: SessionIdStore;
    sync: ProjectSync;
    statuses: SyncStatus[];
};

type SetupOptions = {
    projects?: Project[];
    cookie?: string;
    validateStoredSession?: boolean;
    fileDebounceMs?: number;
    store?: LocalProjectStore;
    /** Wraps the fake server's fetch, e.g. to hold a request. */
    wrapFetch?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch;
};

function setup(options: SetupOptions = {}): Setup {
    const backend = new FakeBackend();
    const store = options.store ?? new LocalProjectStore(() => undefined);
    for (const project of options.projects ?? []) store.put(project);
    const session = createMemorySessionStore();
    if (options.cookie) session.write(options.cookie);

    const sync = new ProjectSync({
        api: new SimulatorApiClient({ baseUrl: backend.baseUrl, fetch: options.wrapFetch?.(backend.fetch) ?? backend.fetch }),
        store,
        session,
        validateStoredSession: options.validateStoredSession,
        generateId: () => NEW_ID,
        fileDebounceMs: options.fileDebounceMs ?? 0,
    });
    const statuses: SyncStatus[] = [];
    sync.subscribe((status) => statuses.push(status));

    return { backend, store, session, sync, statuses };
}

/**
 * Holds the first request whose "METHOD path" matches until release() is
 * called; the server only sees (and applies) it after that.
 */
function holdFirst(match: RegExp) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    let held = false;
    let reached!: () => void;
    const arrived = new Promise<void>((resolve) => {
        reached = resolve;
    });
    const wrapFetch = (inner: typeof globalThis.fetch) =>
        (async (input: RequestInfo | URL, init: RequestInit = {}) => {
            const line = `${(init.method ?? "GET").toUpperCase()} ${new URL(String(input)).pathname}`;
            if (!held && match.test(line)) {
                held = true;
                reached();
                await released;
            }
            return inner(input, init);
        }) as typeof globalThis.fetch;
    return { wrapFetch, release, arrived };
}

/** The server copy of each project, in the local store's shape. */
function mirror(backend: FakeBackend, sessionId: string): Project[] {
    return Object.entries(backend.projectsOf(sessionId)).map(([id, p]) => ({
        id,
        name: p.name,
        architecture: p.architecture as Project["architecture"],
        files: p.files,
    }));
}

describe("session establishment", () => {
    it("with no cookie: creates a session, stores it in the cookie and bulk-syncs every local project", async () => {
        const { backend, session, sync } = setup({ projects: [helloA, otherB] });

        await expect(sync.start()).resolves.toEqual({ ok: true });

        const sessionId = session.read()!;
        expect(backend.requests()).toEqual(["POST /sessions", `PUT /sessions/${sessionId}/projects`]);
        expect(backend.sessions.has(sessionId)).toBe(true);
        expect(backend.log[1].body).toEqual([
            { id: A, name: "Hello", architecture: "SIC-XE", files: { "main.asm": "END", "src/data.asm": "WORD 1" } },
            { id: B, name: "Other", architecture: "SIC", files: {} },
        ]);
        expect(mirror(backend, sessionId)).toEqual([helloA, otherB]);
    });

    it("syncs an empty array when the browser has no projects", async () => {
        const { backend, sync } = setup();

        await sync.start();

        expect(backend.log.map((r) => r.body)).toEqual([undefined, []]);
    });

    it("with a valid cookie: validates it with GET /sessions/{id} and reuses it", async () => {
        const existing = "0d9c8b7a-6f5e-4d3c-9b2a-1f0e9d8c7b6a";
        const { backend, session, sync } = setup({ projects: [helloA], cookie: existing });
        backend.sessions.set(existing, new Map());

        await sync.start();

        expect(backend.requests()).toEqual([`GET /sessions/${existing}`, `PUT /sessions/${existing}/projects`]);
        expect(session.read()).toBe(existing);
        expect(mirror(backend, existing)).toEqual([helloA]);
    });

    it("can skip the optional validation", async () => {
        const { backend, sync } = setup({ cookie: A, validateStoredSession: false });
        backend.sessions.set(A, new Map());

        await sync.start();

        expect(backend.requests()).toEqual([`PUT /sessions/${A}/projects`]);
    });

    it("replaces a cookie the server no longer knows", async () => {
        const { backend, session, sync } = setup({ projects: [helloA], cookie: B });

        await sync.start();

        const fresh = session.read()!;
        expect(fresh).not.toBe(B);
        expect(backend.requests()).toEqual([`GET /sessions/${B}`, "POST /sessions", `PUT /sessions/${fresh}/projects`]);
        expect(mirror(backend, fresh)).toEqual([helloA]);
    });

    it("ignores a malformed cookie instead of sending it", async () => {
        const { backend, session, sync } = setup({ cookie: "not-a-uuid" });

        await sync.start();

        expect(backend.requests()[0]).toBe("POST /sessions");
        expect(session.read()).not.toBe("not-a-uuid");
    });

    it("keeps the cookie when validation fails for another reason, and tries again later", async () => {
        const { backend, session, sync, statuses } = setup({ cookie: A });
        backend.sessions.set(A, new Map());
        backend.failNext(/^GET \/sessions\//, () => json(500, { type: "internal-error", status: 500, title: "Internal server error" }));

        const first = await sync.start();

        expect(first).toMatchObject({ ok: false, kind: "server" });
        expect(statuses.at(-1)).toMatchObject({ state: "error", kind: "server" });
        expect(session.read()).toBe(A);
        expect(backend.requests()).toEqual([`GET /sessions/${A}`]);

        await expect(sync.start()).resolves.toEqual({ ok: true });
        expect(backend.requests()).toEqual([`GET /sessions/${A}`, `GET /sessions/${A}`, `PUT /sessions/${A}/projects`]);
    });

    it("establishes the session once for concurrent callers", async () => {
        const { backend, sync } = setup({ projects: [helloA] });

        await Promise.all([sync.start(), sync.start(), sync.saveFile(A, "main.asm", "x")]);

        expect(backend.requests(/^POST/)).toHaveLength(1);
        expect(backend.requests(/projects$/)).toHaveLength(1);
    });

    it("reports a payload-too-large bulk sync without treating it as session expiry", async () => {
        const { backend, sync } = setup({ projects: [helloA] });
        backend.failNext(/^PUT \/sessions\/[^/]+\/projects$/, () => json(413, { type: "payload-too-large", status: 413, title: "Payload too large" }));

        await expect(sync.start()).resolves.toMatchObject({ ok: false, kind: "payload-too-large" });
        expect(backend.requests(/^POST/)).toHaveLength(1);
    });
});

describe("session recovery", () => {
    it("on session-not-found: creates a new session, re-syncs every local project, then retries the operation", async () => {
        const { backend, session, sync, statuses } = setup({ projects: [helloA, otherB] });
        await sync.start();
        const old = session.read()!;
        backend.restart();
        backend.log.length = 0;

        await expect(sync.saveFile(A, "main.asm", "LDA #5")).resolves.toEqual({ ok: true });

        const fresh = session.read()!;
        expect(fresh).not.toBe(old);
        expect(backend.requests()).toEqual([
            `PUT /sessions/${old}/projects/${A}/files`,
            "POST /sessions",
            `PUT /sessions/${fresh}/projects`,
            `PUT /sessions/${fresh}/projects/${A}/files`,
        ]);
        expect(mirror(backend, fresh)).toEqual([
            { ...helloA, files: { ...helloA.files, "main.asm": "LDA #5" } },
            otherB,
        ]);
        expect(statuses.at(-1)).toMatchObject({ state: "synced", recoveredSession: true });
    });

    it("recovers on the bulk sync itself", async () => {
        const { backend, session, sync } = setup({ cookie: A, validateStoredSession: false, projects: [helloA] });

        await sync.start();

        const fresh = session.read()!;
        expect(backend.requests()).toEqual([`PUT /sessions/${A}/projects`, "POST /sessions", `PUT /sessions/${fresh}/projects`]);
        expect(mirror(backend, fresh)).toEqual([helloA]);
    });

    it("shares one recovery between operations that fail together", async () => {
        const { backend, sync } = setup({ projects: [helloA, otherB] });
        await sync.start();
        backend.restart();
        backend.log.length = 0;

        const outcomes = await Promise.all([
            sync.saveFile(A, "main.asm", "1"),
            sync.saveFile(A, "src/data.asm", "2"),
            sync.updateProject(B, { name: "Renamed" }).synced,
        ]);

        expect(outcomes).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
        expect(backend.requests(/^POST/)).toHaveLength(1);
        expect(backend.requests(/projects$/)).toHaveLength(1);
    });

    it("retries only once", async () => {
        const { backend, sync } = setup({ projects: [helloA] });
        await sync.start();
        backend.restart();
        backend.log.length = 0;
        const fileRoute = /^PUT \/sessions\/[^/]+\/projects\/[^/]+\/files$/;
        backend.failNext(fileRoute, sessionNotFound);
        backend.failNext(fileRoute, sessionNotFound);

        const outcome = await sync.saveFile(A, "main.asm", "x");

        expect(outcome).toMatchObject({ ok: false, kind: "session-expired" });
        expect(backend.requests(/^POST/)).toHaveLength(1);
        expect(backend.requests(fileRoute)).toHaveLength(2);
    });

    it.each([
        ["project-not-found", 404],
        ["file-not-found", 404],
        ["invalid-request", 400],
    ])("does not recover on %s", async (type, status) => {
        const { backend, session, sync } = setup({ projects: [helloA] });
        await sync.start();
        const sessionId = session.read();
        backend.log.length = 0;
        backend.failNext(/\/files$/, () => json(status, { type, status, title: type }));
        backend.failNext(/^PUT \/sessions\/[^/]+\/projects\/[^/]+$/, () => json(status, { type, status, title: type }));

        await sync.saveFile(A, "main.asm", "x");

        expect(backend.requests(/^POST|projects$/)).toEqual([]);
        expect(session.read()).toBe(sessionId);
    });
});

describe("incremental updates", () => {
    it("creates a project locally with a client-generated UUID and upserts it with a ProjectInput body", async () => {
        const { backend, store, session, sync } = setup();
        await sync.start();
        backend.log.length = 0;

        const { project, synced } = sync.createProject({ name: "New", architecture: "SIC" });

        expect(project).toEqual({ id: NEW_ID, name: "New", architecture: "SIC", files: { "main.asm": "" } });
        expect(store.get(NEW_ID)).toEqual(project);
        await expect(synced).resolves.toEqual({ ok: true });
        expect(backend.requests()).toEqual([`PUT /sessions/${session.read()}/projects/${NEW_ID}`]);
        expect(backend.log[0].body).toEqual({ name: "New", architecture: "SIC", files: { "main.asm": "" } });
    });

    it("rejects invalid project input before touching storage or the server", () => {
        const { backend, store, sync } = setup();

        expect(() => sync.createProject({ name: "", architecture: "SIC" })).toThrow(ApiValidationError);
        expect(() => sync.createProject({ name: "x", architecture: "sic-xe" as never })).toThrow(ApiValidationError);
        expect(store.list()).toEqual([]);
        expect(backend.log).toEqual([]);
    });

    it("keeps local edits when the server is unreachable", async () => {
        const { backend, store, sync, statuses } = setup({ projects: [helloA] });
        backend.online = false;

        const outcome = await sync.saveFile(A, "main.asm", "LDA #9");

        expect(outcome).toMatchObject({ ok: false, kind: "network" });
        expect(statuses.at(-1)).toMatchObject({ state: "error", kind: "network" });
        expect(store.get(A)!.files["main.asm"]).toBe("LDA #9");
    });

    it("upserts edited files with { path, content }", async () => {
        const { backend, session, sync } = setup({ projects: [helloA] });
        await sync.start();
        backend.log.length = 0;

        await sync.saveFile(A, "src/new.asm", "RESW 1");

        expect(backend.requests()).toEqual([`PUT /sessions/${session.read()}/projects/${A}/files`]);
        expect(backend.log[0].body).toEqual({ path: "src/new.asm", content: "RESW 1" });
        expect(mirror(backend, session.read()!)[0].files["src/new.asm"]).toBe("RESW 1");
    });

    it("rejects a leading-slash file path before storing or sending", async () => {
        const { backend, store, sync } = setup({ projects: [helloA] });

        await expect(sync.saveFile(A, "/main.asm", "x")).rejects.toBeInstanceOf(ApiValidationError);
        expect(store.get(A)).toEqual(helloA);
        expect(backend.log).toEqual([]);
    });

    it("re-creates the project when the server has lost only the project", async () => {
        const { backend, session, sync } = setup({ projects: [helloA] });
        await sync.start();
        backend.sessions.get(session.read()!)!.delete(A);
        backend.log.length = 0;

        await expect(sync.saveFile(A, "main.asm", "x")).resolves.toEqual({ ok: true });

        expect(backend.requests()).toEqual([
            `PUT /sessions/${session.read()}/projects/${A}/files`,
            `PUT /sessions/${session.read()}/projects/${A}`,
        ]);
        expect(mirror(backend, session.read()!)).toEqual([{ ...helloA, files: { ...helloA.files, "main.asm": "x" } }]);
    });

    it("upserts project metadata changes with the whole local project", async () => {
        const { backend, session, sync } = setup({ projects: [helloA] });
        await sync.start();
        backend.log.length = 0;

        const { project, synced } = sync.updateProject(A, { name: "Renamed", architecture: "SIC" });
        await synced;

        expect(project).toEqual({ ...helloA, name: "Renamed", architecture: "SIC" });
        expect(backend.log[0]).toMatchObject({ method: "PUT", path: `/sessions/${session.read()}/projects/${A}` });
        expect(backend.log[0].body).toEqual({ name: "Renamed", architecture: "SIC", files: helloA.files });
    });

    it("deletes projects locally and on the server", async () => {
        const { backend, store, session, sync } = setup({ projects: [helloA, otherB] });
        await sync.start();
        backend.log.length = 0;

        await expect(sync.deleteProject(A)).resolves.toEqual({ ok: true });

        expect(store.list()).toEqual([otherB]);
        expect(backend.requests()).toEqual([`DELETE /sessions/${session.read()}/projects/${A}`]);
        expect(mirror(backend, session.read()!)).toEqual([otherB]);
    });

    it("treats an already-missing project or file on delete as success", async () => {
        const { backend, session, sync } = setup({ projects: [helloA, otherB] });
        await sync.start();
        delete backend.sessions.get(session.read()!)!.get(A)!.files["main.asm"];
        backend.sessions.get(session.read()!)!.delete(B);

        await expect(sync.deleteFile(A, "main.asm")).resolves.toEqual({ ok: true });
        await expect(sync.deleteProject(B)).resolves.toEqual({ ok: true });
        expect(backend.requests(/^POST/)).toHaveLength(1);
    });

    it("deletes files with the path query parameter", async () => {
        const { backend, store, session, sync } = setup({ projects: [helloA] });
        await sync.start();
        backend.log.length = 0;

        await sync.deleteFile(A, "src/data.asm");

        expect(store.get(A)!.files).toEqual({ "main.asm": "END" });
        expect(backend.requests()).toEqual([`DELETE /sessions/${session.read()}/projects/${A}/files?path=src%2Fdata.asm`]);
        expect(mirror(backend, session.read()!)[0].files).toEqual({ "main.asm": "END" });
    });
});

describe("debounced file saves", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("stores every keystroke locally at once but sends one upsert with the latest content", async () => {
        const { backend, store, session, sync } = setup({ projects: [helloA], fileDebounceMs: 300 });
        await sync.start();
        backend.log.length = 0;

        const outcomes = [sync.saveFile(A, "main.asm", "L"), sync.saveFile(A, "main.asm", "LD"), sync.saveFile(A, "main.asm", "LDA")];
        expect(store.get(A)!.files["main.asm"]).toBe("LDA");
        expect(backend.log).toEqual([]);

        await vi.advanceTimersByTimeAsync(300);

        await expect(Promise.all(outcomes)).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
        expect(backend.log.map((r) => r.body)).toEqual([{ path: "main.asm", content: "LDA" }]);
        expect(mirror(backend, session.read()!)[0].files["main.asm"]).toBe("LDA");
    });

    it("flush sends pending saves immediately", async () => {
        const { backend, sync } = setup({ projects: [helloA], fileDebounceMs: 10_000 });
        await sync.start();
        backend.log.length = 0;

        const outcome = sync.saveFile(A, "main.asm", "now");
        await sync.flush();

        expect(backend.log.map((r) => r.body)).toEqual([{ path: "main.asm", content: "now" }]);
        await expect(outcome).resolves.toEqual({ ok: true });
    });

    it("drops a pending save when the file is deleted first", async () => {
        const { backend, sync } = setup({ projects: [helloA], fileDebounceMs: 300 });
        await sync.start();
        backend.log.length = 0;

        const save = sync.saveFile(A, "main.asm", "gone");
        await sync.deleteFile(A, "main.asm");
        await vi.advanceTimersByTimeAsync(1_000);

        await expect(save).resolves.toEqual({ ok: true });
        expect(backend.requests()).toEqual([expect.stringMatching(/^DELETE .*files\?path=main\.asm$/)]);
    });
});

describe("ordering", () => {
    const fileRoute = /^PUT \/sessions\/[^/]+\/projects\/[^/]+\/files$/;

    it("sends the edits of one file in order, so the newest content lands last", async () => {
        const gate = holdFirst(fileRoute);
        const { backend, session, sync } = setup({ projects: [helloA], wrapFetch: gate.wrapFetch });
        await sync.start();

        const first = sync.saveFile(A, "main.asm", "LDA #1");
        await gate.arrived;
        const second = sync.saveFile(A, "main.asm", "LDA #2");
        await new Promise((resolve) => setTimeout(resolve, 10));
        gate.release();
        await Promise.all([first, second]);

        expect(backend.log.filter((r) => r.body && !Array.isArray(r.body)).map((r) => r.body)).toEqual([
            { path: "main.asm", content: "LDA #1" },
            { path: "main.asm", content: "LDA #2" },
        ]);
        expect(mirror(backend, session.read()!)[0].files["main.asm"]).toBe("LDA #2");
    });

    it("with a stored cookie, an edit made while starting waits for the bulk sync", async () => {
        const existing = "0d9c8b7a-6f5e-4d3c-9b2a-1f0e9d8c7b6a";
        const { backend, sync } = setup({ projects: [helloA], cookie: existing });
        backend.sessions.set(existing, new Map());

        await Promise.all([sync.start(), sync.saveFile(A, "main.asm", "LDA #3")]);

        expect(backend.requests()).toEqual([
            `GET /sessions/${existing}`,
            `PUT /sessions/${existing}/projects`,
            `PUT /sessions/${existing}/projects/${A}/files`,
        ]);
        expect(mirror(backend, existing)[0].files["main.asm"]).toBe("LDA #3");
    });

    it("does not re-create a project deleted while one of its files was being sent", async () => {
        const gate = holdFirst(fileRoute);
        const { backend, session, store, sync } = setup({ projects: [helloA, otherB], wrapFetch: gate.wrapFetch });
        await sync.start();
        const sessionId = session.read()!;
        backend.sessions.get(sessionId)!.delete(A); // the file upsert will answer project-not-found
        backend.log.length = 0;

        const save = sync.saveFile(A, "main.asm", "LDA #4");
        await gate.arrived;
        const removal = sync.deleteProject(A);
        gate.release();
        await Promise.all([save, removal]);

        expect(store.get(A)).toBeNull();
        expect(backend.requests(new RegExp(`^PUT /sessions/${sessionId}/projects/${A}$`))).toEqual([]);
        expect(mirror(backend, sessionId)).toEqual([otherB]);
    });
});

describe("local storage failures", () => {
    it("rejects edits the browser could not store, and sends nothing", async () => {
        localStorage.clear();
        const store = new LocalProjectStore();
        store.put(helloA);
        const { backend, sync } = setup({ store });
        await sync.start();
        backend.log.length = 0;
        const full = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        });

        try {
            await expect(sync.saveFile(A, "main.asm", "lost")).rejects.toThrow(/quota/);
            expect(() => sync.createProject({ name: "New", architecture: "SIC" })).toThrow(/quota/);
            await sync.flush();
        } finally {
            full.mockRestore();
        }

        expect(backend.log).toEqual([]);
        expect(store.get(A)).toEqual(helloA);
    });

    it("restores projects from the server instead of wiping it when the local data is unreadable", async () => {
        localStorage.clear();
        const existing = "0d9c8b7a-6f5e-4d3c-9b2a-1f0e9d8c7b6a";
        const first = setup({ store: new LocalProjectStore(), projects: [helloA, otherB], cookie: existing });
        first.backend.sessions.set(existing, new Map());
        await first.sync.start();
        localStorage.setItem("sicxe.projects.v1", "{truncated");

        const store = new LocalProjectStore();
        const session = createMemorySessionStore();
        session.write(existing);
        const statuses: SyncStatus[] = [];
        const again = new ProjectSync({
            api: new SimulatorApiClient({ baseUrl: first.backend.baseUrl, fetch: first.backend.fetch }),
            store,
            session,
            fileDebounceMs: 0,
        });
        again.subscribe((status) => statuses.push(status));

        await expect(again.start()).resolves.toEqual({ ok: true });

        expect(mirror(first.backend, existing)).toEqual([helloA, otherB]);
        expect(store.list()).toEqual([helloA, otherB]);
        expect(store.isUnreadable()).toBe(false);
        expect(statuses.at(-1)).toMatchObject({ state: "synced", restoredProjects: 2 });
    });
});

describe("failed mirror writes", () => {
    it("resends a save that failed once the server answers again, and reports synced only then", async () => {
        const { backend, session, sync, statuses } = setup({ projects: [helloA] });
        await sync.start();
        backend.online = false;
        await expect(sync.saveFile(A, "main.asm", "LDA #1")).resolves.toMatchObject({ ok: false, kind: "network" });
        backend.online = true;

        await sync.saveFile(A, "b.asm", "END");
        await sync.flush();

        expect(mirror(backend, session.read()!)[0].files).toEqual({ ...helloA.files, "main.asm": "LDA #1", "b.asm": "END" });
        expect(statuses.at(-1)).toEqual({ state: "synced", recoveredSession: false });
    });

    it("keeps reporting the error while a failed save is still not on the server", async () => {
        const { backend, session, sync, statuses } = setup({ projects: [helloA, otherB] });
        await sync.start();
        backend.online = false;
        await sync.saveFile(A, "main.asm", "LDA #1");
        backend.online = true;
        const filesOfA = new RegExp(`^PUT /sessions/[^/]+/projects/${A}/files$`);
        const serverError = () => json(500, { type: "internal-error", status: 500, title: "Internal server error" });
        backend.failNext(filesOfA, serverError);
        backend.failNext(filesOfA, serverError);
        const sinceFailure = statuses.length;

        await expect(sync.saveFile(B, "main.asm", "END")).resolves.toEqual({ ok: true });
        await sync.flush();

        expect(backend.requests(filesOfA)).toHaveLength(2); // after the save of B, and in flush()
        expect(statuses.slice(sinceFailure).map((status) => status.state)).not.toContain("synced");
        expect(sync.getStatus()).toMatchObject({ state: "error", kind: "server" });

        await sync.flush();

        expect(mirror(backend, session.read()!)[0].files["main.asm"]).toBe("LDA #1");
        expect(sync.getStatus()).toEqual({ state: "synced", recoveredSession: false });
    });

    it("resends a project upsert that failed", async () => {
        const { backend, session, sync } = setup();
        await sync.start();
        backend.online = false;
        const { synced } = sync.createProject({ name: "New", architecture: "SIC" });
        await expect(synced).resolves.toMatchObject({ ok: false });
        backend.online = true;

        await sync.flush();

        expect(mirror(backend, session.read()!)).toEqual([{ id: NEW_ID, name: "New", architecture: "SIC", files: { "main.asm": "" } }]);
    });

    it("treats inherited names like toString as missing files", async () => {
        const { backend, sync } = setup({ projects: [helloA] });
        await sync.start();
        backend.log.length = 0;

        await expect(sync.deleteFile(A, "toString")).resolves.toEqual({ ok: true });

        expect(backend.requests()).toEqual([expect.stringMatching(/^DELETE .*files\?path=toString$/)]);
    });
});
