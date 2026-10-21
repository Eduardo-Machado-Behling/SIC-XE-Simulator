/**
 * TEMPORARY bridge between browser-stored projects and the /ws simulator.
 *
 * Projects now live in the browser and are mirrored to a server *session*
 * over the documented HTTP API (src/lib/projects). The /ws simulator, which
 * api_spec/openapi.yaml does not describe, still reads only the backend's
 * legacy, server-global project list: `load $<id>` accepts `[\w_]+` ids
 * (not UUIDs) and `load %<file>` runs that project's copy of the file. Until
 * the backend lets /ws use session projects (a contract decision for the
 * backend owner, tracked from issue #41), execution stages the browser's
 * project there through the legacy routes the frontend used before:
 *
 *   PUT /project?id=<hex>&name=…&arch=<library>   (re)creates it, files reset
 *   /ws `load $<hex>`                              binds it, returns ArchitectureInfo
 *   PUT /simulator/project/file {filePath,content} once per file
 *   /ws `load %<file>`                             runs (Run only)
 *
 * The legacy list is shared by every client of the server, as it was before
 * this branch, and the simulator binds one project at a time, so Run binds
 * and stages again right before executing. Within this page, stagings and
 * the other simulator commands run one at a time (exclusive()); nothing
 * orders them against other browsers using the same server. Delete this
 * file once /ws reads session projects.
 */
import { SimulatorApiClient } from "@/lib/api/SimulatorApiClient";
import type { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import type { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import type { Project } from "@/lib/simulator/Project";
import type { SimulatorTransport } from "@/lib/transport/SimulatorTransport";

/** File names the /ws `load %<file>` command accepts. */
const RUNNABLE_FILE = /^[A-Za-z0-9._-]+$/;

export type LegacyExecutionBridgeOptions = {
    /** Backend base URL, e.g. http://localhost:8080. */
    baseUrl: string;
    transport: Pick<SimulatorTransport, "loadProject" | "loadFile">;
    /** Defaults to the global fetch, looked up on each call. */
    fetch?: typeof fetch;
};

/** The legacy id for a project: its UUID without dashes, which `load $` accepts. */
export function legacyProjectId(projectId: string): string {
    return projectId.replace(/-/g, "");
}

export class LegacyExecutionBridge {
    private readonly baseUrl: string;
    private readonly transport: LegacyExecutionBridgeOptions["transport"];
    private readonly fetchImpl: typeof fetch;
    private readonly api: SimulatorApiClient;
    private architectures: Promise<string[]> | null = null;
    /** The last queued staging: each bind re-creates the legacy project, so they never overlap. */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(options: LegacyExecutionBridgeOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.transport = options.transport;
        this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
        this.api = new SimulatorApiClient({ baseUrl: this.baseUrl, fetch: this.fetchImpl });
    }

    /** Stages the project and binds the simulator to it; returns its ArchitectureInfo. */
    bind(project: Project): Promise<ArchitectureInfo> {
        return this.exclusive(() => this.stage(project));
    }

    /** Stages the project as it is now, then runs one of its files. */
    run(project: Project, path: string): Promise<ExecutionEvent[]> {
        if (!Object.hasOwn(project.files, path)) return Promise.reject(new Error(`The project has no file "${path}".`));
        if (!RUNNABLE_FILE.test(path)) {
            return Promise.reject(new Error(
                `The simulator cannot run "${path}" yet: only files at the top of the project whose names use letters, digits, ".", "_" or "-".`,
            ));
        }

        return this.exclusive(async () => {
            await this.stage(project);
            return this.transport.loadFile(path);
        });
    }

    /**
     * Runs a simulator command (step, reset) after any staging in progress, so
     * it never lands between a staging's re-created project and its files.
     */
    exclusive<T>(task: () => Promise<T>): Promise<T> {
        const next = this.queue.catch(() => undefined).then(task);
        this.queue = next;
        return next;
    }

    private async stage(project: Project): Promise<ArchitectureInfo> {
        await this.requireArchitecture(project.architecture);

        const id = legacyProjectId(project.id);
        const query = new URLSearchParams({ id, name: project.name, arch: project.architecture.toLowerCase() });
        await this.legacy(`/project?${query}`, undefined);

        const { arch } = await this.transport.loadProject(id);

        for (const path of Object.keys(project.files).sort()) {
            await this.legacy("/simulator/project/file", { filePath: path, content: project.files[path] });
        }
        return arch;
    }

    /** Loading an architecture the server lacks would fail inside the /ws handler, so check first. */
    private async requireArchitecture(architecture: string): Promise<void> {
        if (!this.architectures) {
            const listed = this.api.listArchitectures();
            this.architectures = listed;
            listed.catch(() => {
                if (this.architectures === listed) this.architectures = null;
            });
        }
        if (!(await this.architectures).includes(architecture)) {
            throw new Error(`The ${architecture} architecture is not available on this simulator server.`);
        }
    }

    private async legacy(path: string, body: unknown): Promise<void> {
        let response: Response;
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method: "PUT",
                ...(body === undefined
                    ? {}
                    : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
            });
        } catch (error) {
            throw new Error(`Could not reach the simulator server${error instanceof Error ? `: ${error.message}` : ""}`, { cause: error });
        }
        if (response.ok) return;

        let detail = `HTTP ${response.status}`;
        try {
            const parsed = (await response.json()) as { error?: unknown };
            if (typeof parsed?.error === "string") detail = parsed.error;
        } catch {
            // keep the status
        }
        throw new Error(`The simulator server refused to stage the project: ${detail}`);
    }
}
