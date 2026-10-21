
"use client";

import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import type { AssemblySymbol } from "@/lib/simulator/ExecutionEvent";
import RegisterTable, { RegisterState } from "@/components/RegisterTable";
import MemoryTable from "@/components/MemoryTable";
import SymbolTable from "@/components/SymbolTable";
import { Tabs, type TabDefinition } from "@/components/Tabs";
import { Separator } from "react-resizable-panels";
import { useState } from "react";

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
    symbols: AssemblySymbol[] | null;
}

export function ExecutionView({ arch, registers, memory, memorySize, pc, changedMemory, changedRegisters, changeRevision, consumedMemory, symbols }: ArchProps) {
    const [selectedTab, setSelectedTab] = useState("cpu");

    // The memory table scrolls to the PC on every execution update, but a
    // hidden table has no layout and cannot scroll. Count the updates the CPU
    // tab has been shown for, so an update that arrived while it was hidden
    // scrolls the memory when the tab is shown again. Plain tab switches leave
    // the count, and so the user's scroll position, alone.
    const [pcScroll, setPcScroll] = useState({ revision: changeRevision, pc, count: 0 });
    if (selectedTab === "cpu" && (pcScroll.revision !== changeRevision || pcScroll.pc !== pc)) {
        setPcScroll({ revision: changeRevision, pc, count: pcScroll.count + 1 });
    }

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

    // Each entry is one view of the panel; add an entry to add a tab.
    const tabs: TabDefinition[] = [
        {
            id: "cpu",
            label: "CPU",
            content: (
                <div className="flex h-full min-h-0 w-full flex-col">
                    <RegisterTable registers={registers} changedRegisters={changedRegisters} changeRevision={changeRevision} />
                    <Separator></Separator>

                    <MemoryTable memory={memory} addressSpaceSize={memorySize ? memorySize : 1 << 10} pcAddress={pc} pcScrollRevision={pcScroll.count} consumedAddresses={consumedMemory} changedAddresses={changedMemory} changeRevision={changeRevision}/>
                    <div className="w-full h-4"></div>
                </div>
            ),
        },
        {
            id: "assembler",
            label: "Assembler",
            content: <SymbolTable symbols={symbols} />,
        },
    ];

    return <Tabs label="Execution view" tabs={tabs} selectedId={selectedTab} onSelect={setSelectedTab} />;
}
