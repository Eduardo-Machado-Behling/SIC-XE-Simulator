
"use client";

import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import RegisterTable, { RegisterState } from "@/components/RegisterTable";
import MemoryTable from "@/components/MemoryTable";
import { Separator } from "react-resizable-panels";

export interface ArchProps {
    arch: ArchitectureInfo | null
    memorySize: number | undefined
    memory: Map<number,number>
    registers: RegisterState[]
    pc: number
    changedMemory: number[];
    changedRegisters: string[];
    changeRevision: number;
    consumedMemory: number[];
}

export function ExecutionView({ arch, registers, memory, memorySize, pc, changedMemory, changedRegisters, changeRevision, consumedMemory }: ArchProps) {
    if (!arch)
        return (
            <aside
                className="
                h-full
                bg-zinc-900
                border-r
                border-zinc-800
                flex
                flex-col
            "
            >
            </aside>
        );

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <RegisterTable registers={registers} changedRegisters={changedRegisters} changeRevision={changeRevision} />
            <Separator></Separator>

            <MemoryTable memory={memory} addressSpaceSize={memorySize ? memorySize : 1 << 10} offset={pc} pcAddress={pc} pcScrollRevision={changeRevision} consumedAddresses={consumedMemory} changedAddresses={changedMemory} changeRevision={changeRevision}/>
            <div className="w-full h-4"></div>
        </div>
    );
}

