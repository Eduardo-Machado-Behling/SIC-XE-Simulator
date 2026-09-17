export interface Project {
    id: string;
    name: string;
    architecture: string;

    files: Record<string, string>;
}