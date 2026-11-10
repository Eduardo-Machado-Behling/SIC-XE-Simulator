"use client";

import { MacroTables } from "@/components/MacroTables";
import { MacroTrace } from "@/components/MacroTrace";
import type { TraceLine } from "@/lib/simulator/macroBands";
import { Tabs, type TabDefinition } from "@/components/Tabs";
import type { MacroReport } from "@/lib/simulator/ExecutionEvent";

// ============================================================
// Types
// ============================================================

export type MacroViewProps = {
    // null before the first run, or after a run whose events carried none.
    report: MacroReport | null;
    onSelectExpansion: (serial: number) => void;
    onSelectLine?: (target: TraceLine) => void;
};

// ============================================================
// MacroView
// ============================================================

export function MacroView({ report, onSelectExpansion, onSelectLine }: MacroViewProps) {
    if (!report?.hasMacros) {
        return (
            <section className="flex h-full min-h-0 w-full flex-col bg-zinc-900">
                <p role="status" className="px-3 py-3 text-xs text-zinc-500">
                    Run a program that uses MCDEFN to see the macro processor
                </p>
            </section>
        );
    }

    const tabs: TabDefinition[] = [
        {
            id: "tables",
            label: "Tables",
            content: <MacroTables report={report} onSelectExpansion={onSelectExpansion} />,
        },
        {
            id: "trace",
            label: "Trace",
            content: <MacroTrace report={report} onSelectLine={onSelectLine ?? (() => {})} />,
        },
    ];

    return (
        <section className="flex h-full min-h-0 w-full flex-col bg-zinc-900">
            <Tabs label="Macro processor view" tabs={tabs} defaultTabId="tables" />
        </section>
    );
}

export default MacroView;
