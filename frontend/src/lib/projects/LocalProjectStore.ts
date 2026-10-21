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

export class LocalProjectStore {
    private memory: Stored = { version: 1, projects: {} };
    private listeners = new Set<() => void>();

    constructor(private readonly getStorage: () => Storage | undefined = browserStorage) {}

    list(): Project[] {
        return Object.values(this.read().projects).filter(isValidProject).map(copy);
    }

    get(id: string): Project | null {
        const project = this.read().projects[id];
        return isValidProject(project) ? copy(project) : null;
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
            removed = id in projects;
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

    /** Called after every change; returns an unsubscribe function. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    // ---------------------------------------------------------------- private

    private change(id: string, mutate: (project: Project) => void): Project {
        const current = this.get(id);
        if (!current) throw new Error(`Project ${id} is not stored in this browser`);
        mutate(current);
        this.update((projects) => {
            projects[id] = current;
        });
        return copy(current);
    }

    private read(): Stored {
        const storage = this.getStorage();
        if (!storage) return this.memory;

        let raw: string | null;
        try {
            raw = storage.getItem(PROJECTS_STORAGE_KEY);
        } catch {
            return this.memory;
        }
        if (raw === null) return { version: 1, projects: {} };

        try {
            const parsed = JSON.parse(raw) as Partial<Stored>;
            if (parsed && typeof parsed.projects === "object" && parsed.projects !== null && !Array.isArray(parsed.projects)) {
                return { version: 1, projects: parsed.projects };
            }
        } catch {
            // fall through
        }

        // Unreadable data: keep a copy before the next write replaces it.
        try {
            if (storage.getItem(`${PROJECTS_STORAGE_KEY}.corrupt`) === null) {
                storage.setItem(`${PROJECTS_STORAGE_KEY}.corrupt`, raw);
            }
        } catch {
            // nothing more we can do
        }
        return { version: 1, projects: {} };
    }

    private update(mutate: (projects: Record<string, unknown>) => void): void {
        const state = this.read();
        mutate(state.projects);

        const storage = this.getStorage();
        if (storage) {
            // Let quota/security errors reach the caller: the edit was not kept.
            storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(state));
        } else {
            this.memory = state;
        }

        for (const listener of this.listeners) listener();
    }
}
