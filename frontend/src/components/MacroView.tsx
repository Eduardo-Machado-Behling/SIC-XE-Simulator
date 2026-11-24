"use client";

import { MacroTables } from "@/components/MacroTables";
import { MacroTrace } from "@/components/MacroTrace";
import type { TraceLine } from "@/lib/simulator/macroBands";
import { Tabs, type TabDefinition } from "@/components/Tabs";
import type { MacroReport } from "@/lib/simulator/ExecutionEvent";
import { useT } from "@/lib/i18n";

// ============================================================
// Types
// ============================================================

export type MacroViewProps = {
    // null before the first run, or after a run whose events carried none.
    report: MacroReport | null;
    onSelectExpansion: (serial: number) => void;
    // Serial of the expansion last clicked in the Expansions table.
    selectedExpansion?: number | null;
    onSelectLine?: (target: TraceLine) => void;
};

// ============================================================
// MacroView
// ============================================================

export function MacroView({ report, onSelectExpansion, selectedExpansion = null, onSelectLine }: MacroViewProps) {
    const t = useT();
    // The processor stopped before it saw a definition (a lone MCEND): there
    // are no tables, but the failure is the processor's, so say why.
    if (report && !report.ok && !report.hasMacros) {
        return (
            <section className="flex h-full min-h-0 w-full flex-col bg-zinc-900">
                <div role="alert" className="space-y-1 px-3 py-3 text-xs text-red-300">
                    {report.diagnostics.length === 0
                        ? <p>{t("macro.stopped")}</p>
                        : report.diagnostics.map((diagnostic, index) => (
                            <p key={index}>
                                {t("macro.stoppedAt", { position: `${diagnostic.line}:${diagnostic.column}`, message: diagnostic.message })}
                            </p>
                        ))}
                </div>
            </section>
        );
    }

    if (!report?.hasMacros) {
        return (
            <section className="flex h-full min-h-0 w-full flex-col bg-zinc-900">
                <p role="status" className="px-3 py-3 text-xs text-zinc-400">
                    {t("macro.empty")}
                </p>
            </section>
        );
    }

    const tabs: TabDefinition[] = [
        {
            id: "tables",
            label: t("macro.tables"),
            content: <MacroTables report={report} onSelectExpansion={onSelectExpansion} selectedExpansion={selectedExpansion} />,
        },
        {
            id: "trace",
            label: t("macro.trace"),
            content: <MacroTrace report={report} onSelectLine={onSelectLine ?? (() => {})} />,
        },
    ];

    return (
        <section className="flex h-full min-h-0 w-full flex-col bg-zinc-900">
            <Tabs label={t("macro.view")} tabs={tabs} defaultTabId="tables" />
        </section>
    );
}

export default MacroView;
