/**
 * Browser-local project storage: the source of truth for project data
 * (api_spec/openapi.yaml treats the server as a mirror). Projects are kept in
 * localStorage, keyed by their client-generated UUID. Storage is looked up
 * lazily, so the module is safe to import during server rendering, and an
 * in-memory map is used whenever localStorage is missing or unusable.
 */
import { assertFilePath, assertUuid, assertProjectInput, isUuid } from "@/lib/api/contract";
import type { Project } from "@/lib/simulator/Project";

export const PROJECTS_STORAGE_KEY = "sicxe.projects.v1";

type Stored = { version: 1; projects: Record<string, unknown> };

const browserStorage = (): Storage | undefined => {
    try {
        return typeof localStorage === "undefined" ? undefined : localStorage;
    } catch {
        return undefined; // access can throw when storage is disabled
    }
};

function isValidProject(value: unknown): value is Project {
    if (typeof value !== "object" || value === null) return false;
    try {
        assertProjectInput(value);
    } catch {
        return false;
    }
    return isUuid((value as { id?: unknown }).id);
}

function copy(project: Project): Project {
    return { id: project.id, name: project.name, architecture: project.architecture, files: { ...project.files } };
}

/** Where the projects were read from, so the write goes to the same place. */
type Loaded = { state: Stored; storage: Storage | undefined; unreadable: boolean };

const BACKUP_PREFIX = `${PROJECTS_STORAGE_KEY}.corrupt`;

export class LocalProjectStore {
    private memory: Stored = { version: 1, projects: {} };
    private listeners = new Set<() => void>();
    private stopWatchingOtherTabs: (() => void) | null = null;

    constructor(private readonly getStorage: () => Storage | undefined = browserStorage) {}

    list(): Project[] {
        return Object.values(this.load().state.projects).filter(isValidProject).map(copy);
    }

    get(id: string): Project | null {
        const projects = this.load().state.projects;
        if (!Object.hasOwn(projects, id)) return null;
        const project = projects[id];
        return isValidProject(project) ? copy(project) : null;
    }

    /**
     * True when this browser holds project data that cannot be parsed (a copy
     * is kept under a `sicxe.projects.v1.corrupt.*` key). Missing data is not
     * unreadable: it just means no project was saved yet.
     */
    isUnreadable(): boolean {
        return this.load().unreadable;
    }

    /** Creates or replaces a project. Throws ApiValidationError on invalid data. */
    put(project: Project): void {
        assertUuid(project.id, "project.id");
        assertProjectInput(project);
        this.update((projects) => {
            projects[project.id] = copy(project);
        });
    }

    remove(id: string): boolean {
        let removed = false;
        this.update((projects) => {
            removed = Object.hasOwn(projects, id);
            delete projects[id];
        });
        return removed;
    }

    writeFile(id: string, path: string, content: string): Project {
        assertFilePath(path);
        return this.change(id, (project) => {
            project.files[path] = content;
        });
    }

    removeFile(id: string, path: string): Project {
        return this.change(id, (project) => {
            delete project.files[path];
        });
    }

    /**
     * Called after every change, made here or in another tab of this browser;
     * returns an unsubscribe function.
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        this.watchOtherTabs();
        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0) {
                this.stopWatchingOtherTabs?.();
                this.stopWatchingOtherTabs = null;
            }
        };
    }

    // ---------------------------------------------------------------- private

    private notify(): void {
        for (const listener of [...this.listeners]) listener();
    }

    private watchOtherTabs(): void {
        if (this.stopWatchingOtherTabs || typeof window === "undefined") return;
        const onStorage = (event: StorageEvent) => {
            // key null: the other tab cleared the whole storage.
            if (event.key === PROJECTS_STORAGE_KEY || event.key === null) this.notify();
        };
        window.addEventListener("storage", onStorage);
        this.stopWatchingOtherTabs = () => window.removeEventListener("storage", onStorage);
    }

    private change(id: string, mutate: (project: Project) => void): Project {
        const current = this.get(id);
        if (!current) throw new Error(`Project ${id} is not stored in this browser`);
        mutate(current);
        this.update((projects) => {
            projects[id] = current;
        });
        return copy(current);
    }

    private load(): Loaded {
        const memory: Loaded = { state: this.memory, storage: undefined, unreadable: false };
        const storage = this.getStorage();
        if (!storage) return memory;

        let raw: string | null;
        try {
            raw = storage.getItem(PROJECTS_STORAGE_KEY);
        } catch {
            return memory; // storage exists but is unusable: use memory for writes too
        }
        if (raw === null) return { state: { version: 1, projects: {} }, storage, unreadable: false };

        try {
            const parsed = JSON.parse(raw) as Partial<Stored>;
            if (parsed && typeof parsed.projects === "object" && parsed.projects !== null && !Array.isArray(parsed.projects)) {
                return { state: { version: 1, projects: parsed.projects }, storage, unreadable: false };
            }
        } catch {
            // fall through
        }

        backUp(storage, raw);
        return { state: { version: 1, projects: {} }, storage, unreadable: true };
    }

    private update(mutate: (projects: Record<string, unknown>) => void): void {
        const { state, storage } = this.load();
        mutate(state.projects);

        if (storage) {
            // Let quota/security errors reach the caller: the edit was not kept.
            storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(state));
        } else {
            this.memory = state;
        }

        this.notify();
    }
}

/**
 * Keeps a copy of unreadable data before the next write replaces it: one
 * backup per distinct value, each under its own timestamped key, so a later
 * incident never overwrites an earlier backup.
 */
function backUp(storage: Storage, raw: string): void {
    try {
        for (let i = 0; i < storage.length; i += 1) {
            const key = storage.key(i);
            if (key?.startsWith(BACKUP_PREFIX) && storage.getItem(key) === raw) return;
        }
        let key = `${BACKUP_PREFIX}.${new Date().toISOString()}`;
        for (let n = 1; storage.getItem(key) !== null; n += 1) key = `${BACKUP_PREFIX}.${new Date().toISOString()}.${n}`;
        storage.setItem(key, raw);
    } catch {
        // nothing more we can do
    }
}
