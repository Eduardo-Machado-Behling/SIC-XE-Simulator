
"use client";

import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import { useEffect, useRef, useState } from "react";
import RegisterTable, { RegisterState } from "@/components/RegisterTable";
import MemoryTable from "@/components/MemoryTable";
import { Separator } from "react-resizable-panels";

export interface ArchProps {
    arch: ArchitectureInfo | null
    memorySize: number | undefined
    memory: Map<number,number>
    registers: RegisterState[]
    pc: number
}

export function ExecutionView({ arch, registers, memory, memorySize, pc }: ArchProps) {
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
        <div  className="flex flex-col w-full">
            <RegisterTable registers={registers} />
            <Separator></Separator>

            <MemoryTable memory={memory} addressSpaceSize={memorySize ? memorySize : 1 << 10} offset={pc}/>
            <div className="w-full h-4"></div>
        </div>
    );
}

