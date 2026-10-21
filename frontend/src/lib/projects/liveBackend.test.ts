/**
 * Opt-in check against a running backend:
 *
 *   LIVE_BACKEND_URL=http://localhost:8080 npx vitest run src/lib/projects/liveBackend.test.ts
 *
 * Skipped when LIVE_BACKEND_URL is not set, so `npm test` never needs a server.
 */
import { describe, expect, it } from "vitest";

import { SimulatorApiClient } from "@/lib/api/SimulatorApiClient";
import { ApiProblemError, isSessionNotFound } from "@/lib/api/errors";
import { LocalProjectStore } from "@/lib/projects/LocalProjectStore";
import { ProjectSync } from "@/lib/projects/ProjectSync";
import { createMemorySessionStore } from "@/lib/session/sessionCookie";

const baseUrl = process.env.LIVE_BACKEND_URL;

describe.skipIf(!baseUrl)("live backend", () => {
    const api = new SimulatorApiClient({ baseUrl: baseUrl ?? "http://localhost:8080" });

    function setup(sessionId?: string) {
        const store = new LocalProjectStore(() => undefined);
        const session = createMemorySessionStore();
        if (sessionId) session.write(sessionId);
        const sync = new ProjectSync({ api, store, session, fileDebounceMs: 0 });
        return { store, session, sync };
    }

    it("answers health and architecture identifiers", async () => {
        await expect(api.getHealth()).resolves.toEqual({ status: "ok" });
        const architectures = await api.listArchitectures();
        expect(architectures.every((a) => a === "SIC" || a === "SIC-XE")).toBe(true);
    });

    it("mirrors the local store through the documented flow", async () => {
        const { store, session, sync } = setup();
        const a = crypto.randomUUID();
        store.put({ id: a, name: "Live A", architecture: "SIC-XE", files: { "main.asm": "END", "src/data.asm": "WORD 1" } });

        await expect(sync.start()).resolves.toEqual({ ok: true });
        const sessionId = session.read()!;
        expect((await api.getSession(sessionId)).sessionId).toBe(sessionId);
        expect((await api.listProjects(sessionId)).map((p) => p.id)).toEqual([a]);

        await expect(sync.saveFile(a, "main.asm", "LDA #1")).resolves.toEqual({ ok: true });
        expect((await api.getProject(sessionId, a)).files["main.asm"]).toBe("LDA #1");

        const { project: created, synced } = sync.createProject({ name: "Live B", architecture: "SIC" });
        await expect(synced).resolves.toEqual({ ok: true });
        await expect(sync.updateProject(created.id, { name: "Live B2" }).synced).resolves.toEqual({ ok: true });
        expect((await api.getProject(sessionId, created.id)).name).toBe("Live B2");

        await expect(sync.deleteFile(a, "src/data.asm")).resolves.toEqual({ ok: true });
        expect(Object.keys((await api.getProject(sessionId, a)).files)).toEqual(["main.asm"]);

        await expect(sync.deleteProject(created.id)).resolves.toEqual({ ok: true });
        expect((await api.listProjects(sessionId)).map((p) => p.id)).toEqual([a]);

        const missing = await api.getProject(sessionId, crypto.randomUUID()).catch((e: unknown) => e);
        expect(missing).toBeInstanceOf(ApiProblemError);
        expect((missing as ApiProblemError).type).toBe("project-not-found");
        expect(isSessionNotFound(missing)).toBe(false);
    });

    it("recovers from a session the server does not know", async () => {
        const unknown = crypto.randomUUID();
        const { store, session, sync } = setup(unknown);
        const a = crypto.randomUUID();
        store.put({ id: a, name: "Recovered", architecture: "SIC", files: { "main.asm": "" } });

        await expect(sync.start()).resolves.toEqual({ ok: true });

        const fresh = session.read()!;
        expect(fresh).not.toBe(unknown);
        expect((await api.listProjects(fresh)).map((p) => p.id)).toEqual([a]);
    });
});
