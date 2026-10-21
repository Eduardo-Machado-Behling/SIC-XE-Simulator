/**
 * Keeps the server's session-scoped mirror in step with the browser-local
 * project store, following the client flow of api_spec/openapi.yaml:
 *
 * 1. Reuse the session id from the cookie (optionally validated with
 *    GET /sessions/{id}) or create one with POST /sessions and store it.
 * 2. Bulk-sync every local project with PUT /sessions/{id}/projects.
 * 3. Send later changes one by one (project upsert/delete, file
 *    upsert/delete).
 * 4. When a session-scoped call answers 404 `session-not-found` (and only
 *    then), create a new session, store it, bulk-sync again and retry the
 *    interrupted call once.
 *
 * Local writes happen first and never depend on the server; server failures
 * are reported (SyncOutcome / SyncStatus) and the local data is kept. A write
 * that failed is sent again (from the current local state) after the next
 * successful one, on flush() and with every bulk sync; until then the status
 * stays "error".
 *
 * Every request for one project (its upsert/delete and its files) runs in
 * order on one queue and reads the local store when it is sent, so an older
 * body never lands last and a deleted project is never re-created.
 *
 * When the browser's stored projects cannot be read, the start-up sync first
 * restores them from the server's copy instead of replacing that copy with
 * an empty set.
 */
import type { SimulatorApiClient } from "@/lib/api/SimulatorApiClient";
import { assertFilePath, assertProjectInput, isUuid, toProjectInput, type Architecture } from "@/lib/api/contract";
import { describeApiError, isProblemType, isSessionNotFound, type ApiErrorKind } from "@/lib/api/errors";
import type { LocalProjectStore } from "@/lib/projects/LocalProjectStore";
import type { SessionIdStore } from "@/lib/session/sessionCookie";
import type { Project } from "@/lib/simulator/Project";

export type SyncOutcome = { ok: true } | { ok: false; kind: ApiErrorKind; message: string; error: unknown };

export type SyncStatus =
    | { state: "idle" }
    | { state: "syncing" }
    | { state: "synced"; recoveredSession: boolean; restoredProjects?: number }
    | { state: "error"; kind: ApiErrorKind; message: string };

type ProjectApi = Pick<
    SimulatorApiClient,
    "listArchitectures" | "createSession" | "getSession" | "listProjects" | "getProject" | "syncProjects" | "upsertProject" | "deleteProject" | "upsertFile" | "deleteFile"
>;

export type ProjectSyncOptions = {
    api: ProjectApi;
    store: LocalProjectStore;
    session: SessionIdStore;
    /** Check a stored session id with GET /sessions/{id} before using it. Default true. */
    validateStoredSession?: boolean;
    /** New project ids. Default crypto.randomUUID(). */
    generateId?: () => string;
    /** Delay before an edited file is sent; edits within it are coalesced. Default 400 ms. */
    fileDebounceMs?: number;
};

export type NewProject = { name: string; architecture: Architecture; files?: Record<string, string> };

const DEFAULT_FILES = { "main.asm": "" };

type PendingFile = { projectId: string; path: string; timer: ReturnType<typeof setTimeout> | null; waiters: Array<(o: SyncOutcome) => void> };

/** What a write brings in line with the local store: a whole project (path null) or one of its files. */
type WriteTarget = { projectId: string; path: string | null };

type FailedWrite = WriteTarget & { kind: ApiErrorKind; message: string; seq: number };

export class ProjectSync {
    private readonly api: ProjectApi;
    private readonly store: LocalProjectStore;
    private readonly session: SessionIdStore;
    private readonly validateStoredSession: boolean;
    private readonly generateId: () => string;
    private readonly fileDebounceMs: number;

    /** Session currently in use (after its bulk sync). */
    private sessionId: string | null = null;
    /** Establishment or recovery in progress (or done). */
    private ready: Promise<string> | null = null;
    private recovery: { from: string; promise: Promise<string> } | null = null;
    private recoveredSinceLastStatus = false;
    private restoredSinceLastStatus = 0;

    private pendingFiles = new Map<string, PendingFile>();
    /** Last queued request per project. */
    private inflight = new Map<string, Promise<unknown>>();
    /** Writes whose last attempt failed, by writeKey(). */
    private failed = new Map<string, FailedWrite>();
    private failureSeq = 0;
    private retrying: Promise<void> | null = null;

    private projectsCache: Project[] | null = null;

    private status: SyncStatus = { state: "idle" };
    private running = 0;
    private listeners = new Set<(status: SyncStatus) => void>();

    constructor(options: ProjectSyncOptions) {
        this.api = options.api;
        this.store = options.store;
        this.session = options.session;
        this.validateStoredSession = options.validateStoredSession ?? true;
        this.generateId = options.generateId ?? (() => crypto.randomUUID());
        this.fileDebounceMs = options.fileDebounceMs ?? 400;
        this.store.subscribe(() => {
            this.projectsCache = null;
        });
    }

    // ---------------------------------------------------------- architectures

    /** The architectures this server can simulate (GET /simulator/architectures). */
    availableArchitectures(): Promise<Architecture[]> {
        return this.api.listArchitectures();
    }

    // ----------------------------------------------------------------- status

    getStatus(): SyncStatus {
        return this.status;
    }

    subscribe(listener: (status: SyncStatus) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private setStatus(status: SyncStatus): void {
        this.status = status;
        for (const listener of this.listeners) listener(status);
    }

    /**
     * Runs a server operation, reporting progress and turning failures into an
     * outcome. With a target, the failure is remembered (and forgotten again
     * once that target is written) so it can be retried.
     */
    private async mirror(operation: () => Promise<unknown>, target?: WriteTarget): Promise<SyncOutcome> {
        this.running += 1;
        if (this.running === 1) this.setStatus({ state: "syncing" });
        try {
            await operation();
        } catch (error) {
            this.running -= 1;
            const { kind, message } = describeApiError(error);
            if (target) this.failed.set(writeKey(target), { ...target, kind, message, seq: ++this.failureSeq });
            this.setStatus({ state: "error", kind, message });
            return { ok: false, kind, message, error };
        }

        this.running -= 1;
        if (target) this.forgetFailures(target);
        this.settleStatus();
        if (this.failed.size > 0) void this.retryFailed();
        return { ok: true };
    }

    private settleStatus(): void {
        if (this.running !== 0) return;
        const failure = [...this.failed.values()].at(-1);
        if (failure) {
            this.setStatus({ state: "error", kind: failure.kind, message: failure.message });
            return;
        }
        const restored = this.restoredSinceLastStatus;
        this.setStatus({
            state: "synced",
            recoveredSession: this.recoveredSinceLastStatus,
            ...(restored > 0 ? { restoredProjects: restored } : {}),
        });
        this.recoveredSinceLastStatus = false;
        this.restoredSinceLastStatus = 0;
    }

    private forgetFailures(target: WriteTarget): void {
        if (target.path !== null) {
            this.failed.delete(writeKey(target));
            return;
        }
        // A project upsert or delete covers all of its files.
        for (const [key, failure] of this.failed) {
            if (failure.projectId === target.projectId) this.failed.delete(key);
        }
    }

    /** Sends every remembered failed write again; concurrent callers share one round. */
    private retryFailed(): Promise<void> {
        if (!this.retrying) {
            const targets = [...this.failed.values()].map(({ projectId, path }) => ({ projectId, path }));
            if (targets.length === 0) return Promise.resolve();
            const round = Promise.all(targets.map((target) => this.write(target))).then(() => undefined);
            this.retrying = round;
            void round.finally(() => {
                if (this.retrying === round) this.retrying = null;
            });
        }
        return this.retrying;
    }

    // ---------------------------------------------------------------- session

    /** Establishes the session and bulk-syncs local projects (once per page). */
    start(): Promise<SyncOutcome> {
        return this.mirror(() => this.ensureSession());
    }

    private ensureSession(): Promise<string> {
        if (!this.ready) {
            const attempt = this.establish();
            this.ready = attempt;
            attempt.catch(() => {
                if (this.ready === attempt) this.ready = null;
            });
        }
        return this.ready;
    }

    private async establish(): Promise<string> {
        let sessionId = this.session.read();
        if (sessionId !== null && !isUuid(sessionId)) sessionId = null;

        if (sessionId && this.validateStoredSession) {
            try {
                await this.api.getSession(sessionId);
            } catch (error) {
                if (!isSessionNotFound(error)) throw error;
                sessionId = null;
            }
        }

        if (!sessionId) return this.newSyncedSession();

        try {
            if (this.store.isUnreadable()) await this.restore(sessionId);
            await this.bulkSync(sessionId);
        } catch (error) {
            if (!isSessionNotFound(error)) throw error;
            return this.newSyncedSession();
        }
        this.sessionId = sessionId;
        return sessionId;
    }

    private async newSyncedSession(): Promise<string> {
        const { sessionId } = await this.api.createSession();
        this.session.write(sessionId);
        await this.bulkSync(sessionId);
        this.sessionId = sessionId;
        return sessionId;
    }

    private async bulkSync(sessionId: string): Promise<void> {
        const covered = this.failureSeq;
        // Summaries come back without files; nothing local is replaced by them.
        await this.api.syncProjects(sessionId, this.store.list());
        // The whole local set is on the server now, including earlier failed writes.
        for (const [key, failure] of this.failed) {
            if (failure.seq <= covered) this.failed.delete(key);
        }
    }

    /**
     * The local data is unreadable (a backup was kept), so the server holds the
     * only intact copy: bring its projects back before the bulk sync, which
     * would otherwise replace them with an empty set.
     */
    private async restore(sessionId: string): Promise<void> {
        for (const summary of await this.api.listProjects(sessionId)) {
            if (this.store.get(summary.id)) continue;
            const { name, architecture, files } = await this.api.getProject(sessionId, summary.id);
            this.store.put({ id: summary.id, name, architecture, files });
            this.restoredSinceLastStatus += 1;
        }
    }

    /** Replaces a session the server forgot; concurrent callers share one recovery. */
    private recover(failedSessionId: string): Promise<string> {
        if (this.recovery?.from === failedSessionId) return this.recovery.promise;
        if (this.sessionId && this.sessionId !== failedSessionId) return Promise.resolve(this.sessionId);

        const promise = this.newSyncedSession().then((sessionId) => {
            this.recoveredSinceLastStatus = true;
            return sessionId;
        });
        this.recovery = { from: failedSessionId, promise };
        this.ready = promise;
        promise.catch(() => {
            if (this.recovery?.promise === promise) this.recovery = null;
            if (this.ready === promise) this.ready = null;
        });
        return promise;
    }

    /** Runs a session-scoped call, recovering from session-not-found and retrying once. */
    private async withSession<T>(call: (sessionId: string) => Promise<T>): Promise<T> {
        const sessionId = await this.ensureSession();
        try {
            return await call(sessionId);
        } catch (error) {
            if (!isSessionNotFound(error)) throw error;
            return call(await this.recover(sessionId));
        }
    }

    // --------------------------------------------------------------- projects

    listProjects(): Project[] {
        return this.store.list();
    }

    /** Same array until the local project set changes (for useSyncExternalStore). */
    projectsSnapshot(): Project[] {
        this.projectsCache ??= this.store.list();
        return this.projectsCache;
    }

    /** Called whenever the local project set changes; returns an unsubscribe function. */
    subscribeProjects(listener: () => void): () => void {
        return this.store.subscribe(listener);
    }

    /** The project as stored in this browser, or null. */
    getProject(projectId: string): Project | null {
        return isUuid(projectId) ? this.store.get(projectId) : null;
    }

    createProject(input: NewProject): { project: Project; synced: Promise<SyncOutcome> } {
        const project: Project = {
            id: this.generateId(),
            name: input.name,
            architecture: input.architecture,
            files: { ...(input.files ?? DEFAULT_FILES) },
        };
        assertProjectInput(project);
        this.store.put(project);
        return { project, synced: this.write({ projectId: project.id, path: null }) };
    }

    updateProject(
        projectId: string,
        changes: Partial<Pick<Project, "name" | "architecture">>,
    ): { project: Project; synced: Promise<SyncOutcome> } {
        const current = this.store.get(projectId);
        if (!current) throw new Error(`Project ${projectId} is not stored in this browser`);
        const project = { ...current, ...changes };
        this.store.put(project);
        return { project, synced: this.write({ projectId, path: null }) };
    }

    deleteProject(projectId: string): Promise<SyncOutcome> {
        for (const [key, pending] of this.pendingFiles) {
            if (pending.projectId === projectId) this.cancelPendingFile(key);
        }
        this.store.remove(projectId);
        return this.write({ projectId, path: null });
    }

    // ------------------------------------------------------------------ files

    /** Saves a file locally now and mirrors it to the server (debounced). */
    async saveFile(projectId: string, path: string, content: string): Promise<SyncOutcome> {
        assertFilePath(path);
        this.store.writeFile(projectId, path, content);

        const key = fileKey(projectId, path);
        const pending = this.pendingFiles.get(key) ?? { projectId, path, timer: null, waiters: [] };
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingFiles.set(key, pending);

        const outcome = new Promise<SyncOutcome>((resolve) => pending.waiters.push(resolve));
        if (this.fileDebounceMs <= 0) this.sendFile(key);
        else pending.timer = setTimeout(() => this.sendFile(key), this.fileDebounceMs);
        return outcome;
    }

    async deleteFile(projectId: string, path: string): Promise<SyncOutcome> {
        assertFilePath(path);
        this.cancelPendingFile(fileKey(projectId, path));
        this.store.removeFile(projectId, path);
        return this.write({ projectId, path });
    }

    /** Sends every pending file save and every failed write now, and waits for all requests. */
    async flush(): Promise<void> {
        for (const key of [...this.pendingFiles.keys()]) this.sendFile(key);
        await this.retrying;
        await this.retryFailed();
        await Promise.all([...this.inflight.values()].map((p) => p.catch(() => undefined)));
    }

    private cancelPendingFile(key: string): void {
        const pending = this.pendingFiles.get(key);
        if (!pending) return;
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingFiles.delete(key);
        for (const resolve of pending.waiters) resolve({ ok: true }); // superseded
    }

    private sendFile(key: string): void {
        const pending = this.pendingFiles.get(key);
        if (!pending) return;
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingFiles.delete(key);

        void this.write({ projectId: pending.projectId, path: pending.path }).then((outcome) => {
            for (const resolve of pending.waiters) resolve(outcome);
        });
    }

    /** Queues a write on its project's queue. */
    private write(target: WriteTarget): Promise<SyncOutcome> {
        return this.chain(target.projectId, () => this.mirror(() => this.reconcile(target), target));
    }

    /** Runs requests for one project in order, so an older body never lands last. */
    private chain<T>(key: string, run: () => Promise<T>): Promise<T> {
        const previous = this.inflight.get(key) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(run);
        this.inflight.set(key, next);
        void next.finally(() => {
            if (this.inflight.get(key) === next) this.inflight.delete(key);
        });
        return next;
    }

    /** Makes the server match the local store for the target, read at send time. */
    private async reconcile({ projectId, path }: WriteTarget): Promise<void> {
        await this.withSession(async (sessionId) => {
            const project = this.store.get(projectId);

            if (path === null) {
                if (project) {
                    await this.api.upsertProject(sessionId, projectId, toProjectInput(project));
                    return;
                }
                await this.api.deleteProject(sessionId, projectId).catch((error) => {
                    if (!isProblemType(error, "project-not-found")) throw error;
                });
                return;
            }

            if (!project) return; // the project's own (queued) delete covers its files

            if (!Object.hasOwn(project.files, path)) {
                await this.api.deleteFile(sessionId, projectId, path).catch((error) => {
                    // Already absent on the server: the mirror matches.
                    if (!isProblemType(error, "file-not-found") && !isProblemType(error, "project-not-found")) throw error;
                });
                return;
            }

            try {
                await this.api.upsertFile(sessionId, projectId, { path, content: project.files[path] });
            } catch (error) {
                // The server lost only this project (e.g. created while offline): send it whole,
                // unless it was deleted here meanwhile.
                if (!isProblemType(error, "project-not-found")) throw error;
                const current = this.store.get(projectId);
                if (current) await this.api.upsertProject(sessionId, projectId, toProjectInput(current));
            }
        });
    }
}

function writeKey({ projectId, path }: WriteTarget): string {
    return path === null ? `project\u0000${projectId}` : `file\u0000${fileKey(projectId, path)}`;
}

function fileKey(projectId: string, path: string): string {
    return `${projectId}\u0000${path}`;
}
