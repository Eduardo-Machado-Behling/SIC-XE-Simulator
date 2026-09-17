import { LoadProjectResponse, SimulatorTransport } from "@/lib/transport/SimulatorTransport";
import { WebTransport } from "@/lib/transport/WebTransport";
import { Project } from "@/lib/simulator/Project";
import { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import { RegisterState } from "@/components/RegisterTable";
import { Dispatch, SetStateAction } from "react";
import { stripIsPartialByte } from "next/dist/client/components/segment-cache/cache";
import { ExecutionView } from "@/components/ExecutionView";



export class Simulator {

    public static get(): Simulator {
        if (!this.instance) {
            this.instance = new Simulator();
        }

        return this.instance
    }

    public async step(): Promise<ExecutionEvent[]> {
        return this.transport!.step();
    }
    public async reset(): Promise<ExecutionEvent[]> {
        return this.transport!.reset();
    }

    resolve(
        steps: ExecutionEvent[],
        setMemory: Dispatch<SetStateAction<Map<number, number>>>,
        setRegisters: Dispatch<SetStateAction<RegisterState[]>>
    ) {
        setMemory((memory) => {
            const next = new Map(memory);

            for (const step of steps) {
                if (step.type !== "MemoryWrite")
                    continue;

                step.value.forEach((value, i) => {
                    next.set(step.address + i, value);
                });
            }

            return next;
        });

        setRegisters((registers) => {
            const next = registers.map((register) => ({ ...register }));

            for (const step of steps) {
                if (step.type !== "RegisterWrite")
                    continue;

                const index = next.findIndex(
                    (register) => register.name === step.name
                );

                if (index === -1) {
                    console.warn(`Unknown register: ${step.name}`);
                    continue;
                }

                next[index].value = step.value;
            }

            return next;
        });
    }

    public async setFile(filePath: string, content: string): Promise<unknown> {
        return this.transport!.setFile(filePath, content);
    }

    public async projects(): Promise<Project[]> {
        return this.transport!.projects();
    }

    public async createProject(newProject: Project): Promise<unknown> {
        return this.transport!.createProject(newProject);
    }

    public async loadProject(projectId: string): Promise<LoadProjectResponse> {
        return this.transport!.loadProject(projectId);
    }

    public loadFile(file: string): Promise<ExecutionEvent[]> {
        return this.transport!.loadFile(file)
    }

    private constructor() {
        if (this.is_web()) {
            this.transport = new WebTransport(this.get_url());
            this.transport.connect();
        }
    }

    //TODO: temp
    private is_web() {
        return true;
    }

    private get_url() {
        return "localhost:8080";
    }


    private static instance: Simulator | null = null;
    private transport: SimulatorTransport | null = null;
};