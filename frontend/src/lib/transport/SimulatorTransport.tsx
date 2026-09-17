import { Project } from "@/lib/simulator/Project"

export interface SimulatorTransport {
    connect(): Promise<void>;
    disconnect(): void;

    step(): Promise<unknown>;
    reset(): Promise<unknown>;

    projects(): Promise<Project[]>;
    createProject(newProject: Project): Promise<unknown>;
    loadProject(projectId: string): Promise<Project>;
    loadFile(file: string): Promise<unknown>;
}