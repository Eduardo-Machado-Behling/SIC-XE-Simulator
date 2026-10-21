import { Project } from "@/lib/simulator/Project"
import { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";

export interface LoadProjectResponse {
    project: Project
    arch: ArchitectureInfo
}

/**
 * Simulator execution over the /ws protocol, which api_spec/openapi.yaml does
 * not describe. Project persistence (sessions, projects, files) is not here:
 * it goes through the documented HTTP API (src/lib/api, src/lib/projects).
 */
export interface SimulatorTransport {
    connect(): Promise<void>;
    disconnect(): void;

    step(): Promise<ExecutionEvent[]>;
    reset(): Promise<ExecutionEvent[]>;
    clear(): Promise<ExecutionEvent[]>;

    /** WebSocket `load $<id>`: binds the simulator to a project and returns its ArchitectureInfo. */
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
