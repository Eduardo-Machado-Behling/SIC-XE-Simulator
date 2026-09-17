import { Project } from "@/lib/simulator/Project"
import { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";

export interface LoadProjectResponse {
    project: Project
    arch: ArchitectureInfo
}

export interface SimulatorTransport {
    connect(): Promise<void>;
    disconnect(): void;

    step(): Promise<ExecutionEvent[]>;
    reset(): Promise<unknown>;

    projects(): Promise<Project[]>;
    createProject(newProject: Project): Promise<unknown>;
    loadProject(projectId: string): Promise<LoadProjectResponse>;
    loadFile(file: string): Promise<ArchitectureInfo>;
}