
"use client";

import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import type { AssemblySymbol, LinkerTraceStep, LinkReport, MacroReport } from "@/lib/simulator/ExecutionEvent";
import RegisterTable, { RegisterState } from "@/components/RegisterTable";
import MemoryTable from "@/components/MemoryTable";
import SymbolTable from "@/components/SymbolTable";
import { MacroView } from "@/components/MacroView";
import { LinkerView } from "@/components/LinkerView";
import type { TraceLine } from "@/lib/simulator/macroBands";
import { Tabs, type TabDefinition } from "@/components/Tabs";
import { Separator } from "react-resizable-panels";
import { useState } from "react";
import { useT } from "@/lib/i18n";

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
    macros?: MacroReport | null;
    onSelectExpansion?: (serial: number) => void;
    selectedExpansion?: number | null;
    onSelectLine?: (target: TraceLine) => void;
    linked?: LinkReport | null;
    onSelectLinkStep?: (step: LinkerTraceStep) => void;
}

export function ExecutionView({ arch, registers, memory, memorySize, pc, changedMemory, changedRegisters, changeRevision, consumedMemory, symbols, macros = null, onSelectExpansion, selectedExpansion = null, onSelectLine, linked = null, onSelectLinkStep }: ArchProps) {
    const t = useT();
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
                <p role="status" className="px-3 py-3 text-xs text-zinc-400">{t("exec.noArch")}</p>
            </aside>
        );

    // Each entry is one view of the panel; add an entry to add a tab.
    const tabs: TabDefinition[] = [
        {
            id: "cpu",
            label: "CPU",
            content: (
                <div className="flex h-full min-h-0 w-full flex-col">
                    <RegisterTable label={t("cpu.registers")} registers={registers} changedRegisters={changedRegisters} changeRevision={changeRevision} />
                    <Separator></Separator>

                    <MemoryTable label={t("cpu.memory")} memory={memory} addressSpaceSize={memorySize ? memorySize : 1 << 10} pcAddress={pc} pcScrollRevision={pcScroll.count} consumedAddresses={consumedMemory} changedAddresses={changedMemory} changeRevision={changeRevision}/>
                    <div className="w-full h-4"></div>
                </div>
            ),
        },
        {
            id: "assembler",
            label: t("asm.tab"),
            content: <SymbolTable symbols={symbols} />,
        },
        {
            id: "macros",
            label: t("macro.tab"),
            content: <MacroView report={macros} onSelectExpansion={onSelectExpansion ?? (() => {})} selectedExpansion={selectedExpansion} onSelectLine={onSelectLine} />,
        },
        {
            id: "linker",
            label: t("link.tab"),
            content: <LinkerView linked={linked} onSelectStep={onSelectLinkStep ?? (() => {})} />,
        },
    ];

    return <Tabs label={t("exec.label")} tabs={tabs} selectedId={selectedTab} onSelect={setSelectedTab} />;
}
