"use client";

import type { AssembledProgram, AssemblyReport } from "@/lib/simulator/ExecutionEvent";
import { hex } from "@/lib/simulator/hex";
import AssemblyWarnings from "@/components/AssemblyWarnings";
import ListingTable from "@/components/ListingTable";
import ObjectProgramView from "@/components/ObjectProgramView";
import { PanelMessage } from "@/components/PanelSection";
import RelocationTable from "@/components/RelocationTable";
import SymbolTable from "@/components/SymbolTable";
import { Tabs, type TabDefinition } from "@/components/Tabs";

// ============================================================
// Types
// ============================================================

export type AssemblyViewProps = {
    // null when no report is available: before the first run, or after a run
    // that failed or assembled nothing (a hex dump).
    assembly: AssemblyReport | null;
    pc: number;
};

// ============================================================
// AssemblyView
// ============================================================

function ProgramSummary({ program }: { program: AssembledProgram }) {
    const fields: [string, string][] = [
        ["Program", program.name || "(unnamed)"],
        ["Start", hex(program.start, 6)],
        ["Length", hex(program.length, 6)],
        ["Entry", hex(program.entry, 6)],
    ];

    return (
        <div role="group" aria-label="Program" className="shrink-0 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
            <dl className="grid grid-cols-4 gap-x-3 text-xs">
                {fields.map(([term, value]) => (
                    <div key={term} className="min-w-0">
                        <dt className="text-zinc-500">{term}</dt>
                        <dd className="truncate font-mono text-zinc-200">{value}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

// The Assembler tab: what the two passes made of the last assembled program.
export function AssemblyView({ assembly, pc }: AssemblyViewProps) {
    if (assembly === null) {
        return (
            <div className="flex h-full min-h-0 w-full flex-col bg-zinc-900 pt-3">
                <PanelMessage>
                    No assembly report available. The listing, symbol table and object program appear here
                    after the assembler reports a program.
                </PanelMessage>
            </div>
        );
    }

    const warnings = assembly.diagnostics?.length ?? 0;
    const tabs: TabDefinition[] = [
        { id: "listing", label: "Listing", content: <ListingTable listing={assembly.listing} pc={pc} /> },
        { id: "symbols", label: "Symbols", content: <SymbolTable symbols={assembly.symbols} /> },
        { id: "relocation", label: "Relocation", content: <RelocationTable relocations={assembly.relocations} /> },
        { id: "object", label: "Object", content: <ObjectProgramView report={assembly} /> },
        {
            id: "warnings",
            label: warnings > 0 ? `Warnings (${warnings})` : "Warnings",
            content: <AssemblyWarnings diagnostics={assembly.diagnostics} />,
        },
    ];

    return (
        <div className="flex h-full min-h-0 w-full flex-col bg-zinc-900">
            {assembly.program && <ProgramSummary program={assembly.program} />}
            <div className="flex-1 min-h-0">
                <Tabs label="Assembly" tabs={tabs} />
            </div>
        </div>
    );
}

export default AssemblyView;
