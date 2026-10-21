import type { Architecture, FilePath } from "@/lib/api/contract";

/**
 * A project as the browser stores it (the source of truth): a
 * `ProjectSyncItem` of api_spec/openapi.yaml.
 */
export interface Project {
    /** Client-generated UUID. */
    id: string;
    name: string;
    architecture: Architecture;

    files: Record<FilePath, string>;
}
