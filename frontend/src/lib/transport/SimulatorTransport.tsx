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
    reset(): Promise<ExecutionEvent[]>;
    clear(): Promise<ExecutionEvent[]>;

    setFile(filePath: string, content: string): Promise<void>;
    projects(): Promise<Project[]>;
    architectures(): Promise<string[]>;
    createProject(newProject: Project): Promise<unknown>;
    loadProject(projectId: string): Promise<LoadProjectResponse>;
    loadFile(file: string): Promise<ExecutionEvent[]>;
}

export interface SimulatorProblem {
    type: string;
    status: number;
    title: string;
    detail?: string;
}

export class SimulatorCommandError extends Error {
    constructor(
        readonly problem: SimulatorProblem,
        readonly events: ExecutionEvent[] | null = null,
    ) {
        super(problem.detail || problem.title);
        this.name = "SimulatorCommandError";
    }
}
