import { SimulatorTransport } from "@/lib/transport/SimulatorTransport";
import { WebTransport } from "@/lib/transport/WebTransport";
import { resolveBackendUrl } from "@/lib/api/config";
import { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import { RegisterState } from "@/components/RegisterTable";
import { Dispatch, SetStateAction } from "react";

/**
 * Simulator execution, over the WebSocket transport. Project persistence is
 * not here: see src/lib/projects/ProjectSync.ts (documented HTTP API).
 */
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
    public async clear(): Promise<ExecutionEvent[]> {
        return this.transport!.clear();
    }

    resolve(
        steps: ExecutionEvent[],
        setMemory: Dispatch<SetStateAction<Map<number, number>>>,
        setRegisters: Dispatch<SetStateAction<RegisterState[]>>
    ) {
        setMemory((memory) => {
            const next = new Map(memory);

            for (const step of steps) {
                if (step.type === "MemoryCleared") {
                    next.clear();
                    continue;
                }
                if (step.type !== "MemoryWrite")
                    continue;

                step.bytes.forEach((value, i) => {
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

    /**
     * Binds the simulator to a project over /ws (`load $<id>`) and returns the
     * detailed ArchitectureInfo the register and memory views need. The HTTP
     * contract only lists architecture identifiers, so this stays on /ws.
     */
    public async loadArchitecture(projectId: string): Promise<ArchitectureInfo> {
        const { arch } = await this.transport!.loadProject(projectId);
        return arch;
    }

    public loadFile(file: string): Promise<ExecutionEvent[]> {
        return this.transport!.loadFile(file)
    }

    private constructor() {
        if (this.is_web()) {
            this.transport = new WebTransport(resolveBackendUrl());
            this.transport.connect();
        }
    }

    //TODO: temp
    private is_web() {
        return true;
    }


    private static instance: Simulator | null = null;
    private transport: SimulatorTransport | null = null;
};
