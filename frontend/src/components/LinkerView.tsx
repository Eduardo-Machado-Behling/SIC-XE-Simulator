"use client";

import type { KeyboardEvent } from "react";

import { Tabs, type TabDefinition } from "@/components/Tabs";
import type { LinkerTraceStep, LinkReport } from "@/lib/simulator/ExecutionEvent";
import { useT, type MessageKey } from "@/lib/i18n";

// ============================================================
// Types
// ============================================================

export type LinkerViewProps = {
    // null before the first Run, or after one that failed before linking.
    linked: LinkReport | null;
    onSelectStep: (step: LinkerTraceStep) => void;
};

const hex6 = (value: number) => (value >>> 0).toString(16).toUpperCase().padStart(6, "0").slice(-6);
const HEAD = "sticky top-0 bg-zinc-900 text-left text-zinc-400";

function SectionTitle({ children }: { children: string }) {
    return <h3 className="pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">{children}</h3>;
}

// ============================================================
// Tables: the ESTAB (Beck 3.2.3), relative to the start of the linked program
// ============================================================

function LinkerTables({ linked }: { linked: LinkReport }) {
    const t = useT();
    return (
        <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
            <p className="pt-2 text-xs text-zinc-400">{t("link.loadAddress", { address: hex6(linked.loadAddress) })}</p>
            <SectionTitle>{t("link.estabTitle")}</SectionTitle>
            <table aria-label={t("link.estab")} className="w-full text-xs">
                <thead className={HEAD}>
                    <tr>
                        <th scope="col" className="py-1 font-medium">{t("link.section")}</th>
                        <th scope="col" className="py-1 font-medium">{t("link.symbol")}</th>
                        <th scope="col" className="py-1 font-medium">{t("link.address")}</th>
                        <th scope="col" className="py-1 font-medium">{t("link.length")}</th>
                        <th scope="col" className="py-1 font-medium">{t("link.origin")}</th>
                    </tr>
                </thead>
                <tbody className="font-mono">
                    {linked.estab.map((row, index) => {
                        const sectionRow = row.symbol === "";
                        return (
                            <tr key={index} className={sectionRow ? "border-t border-zinc-700" : ""}>
                                <td className="py-1 text-zinc-200">{sectionRow ? row.section : ""}</td>
                                <td className="py-1 text-zinc-300">{row.symbol}</td>
                                <td className="py-1 text-zinc-300">{hex6(row.address)}</td>
                                <td className="py-1 text-zinc-400">{sectionRow ? hex6(row.length) : ""}</td>
                                <td className="truncate py-1 font-sans text-zinc-400">{row.file}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ============================================================
// Trace: pass 1 places sections, pass 2 fixes fields, the loader relocates
// ============================================================

const PASSES: { pass: LinkerTraceStep["pass"]; title: MessageKey }[] = [
    { pass: "1", title: "link.pass1" },
    { pass: "2", title: "link.pass2" },
    { pass: "load", title: "link.loader" },
];

function LinkerTrace({ linked, onSelectStep }: LinkerViewProps & { linked: LinkReport }) {
    const t = useT();
    const onKey = (event: KeyboardEvent, step: LinkerTraceStep) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectStep(step);
        }
    };
    return (
        <div aria-label={t("link.traceList")} className="flex-1 min-h-0 overflow-auto px-3 pb-3">
            {PASSES.map(({ pass, title }) => {
                const steps = linked.trace.filter((step) => step.pass === pass);
                if (steps.length === 0) return null;
                return (
                    <section key={pass}>
                        <SectionTitle>{t(title)}</SectionTitle>
                        <ul className="space-y-px">
                            {steps.map((step, index) => {
                                const change = pass === "1" ? "" : `${hex6(step.before)} → ${hex6(step.after)}`;
                                return (
                                    <li key={index}>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            aria-label={change ? `${step.text} · ${change}` : step.text}
                                            onClick={() => onSelectStep(step)}
                                            onKeyDown={(event) => onKey(event, step)}
                                            className="flex cursor-pointer items-baseline gap-3 rounded px-1.5 py-0.5 font-mono text-xs text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-blue-400"
                                        >
                                            <span className="min-w-0 flex-1 truncate">{step.text}</span>
                                            {change && <span className="shrink-0 text-zinc-400">{change}</span>}
                                            {step.file && <span className="shrink-0 font-sans text-zinc-500">{step.file}:{step.line}</span>}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}

// ============================================================
// LinkerView
// ============================================================

export function LinkerView({ linked, onSelectStep }: LinkerViewProps) {
    const t = useT();
    if (!linked) {
        return (
            <section className="flex h-full min-h-0 w-full flex-col bg-zinc-900">
                <p role="status" className="px-3 py-3 text-xs text-zinc-400">{t("link.empty")}</p>
            </section>
        );
    }
    const tabs: TabDefinition[] = [
        { id: "tables", label: t("link.tables"), content: <LinkerTables linked={linked} /> },
        { id: "trace", label: t("link.trace"), content: <LinkerTrace linked={linked} onSelectStep={onSelectStep} /> },
    ];
    return (
        <section aria-label={t("link.view")} className="flex h-full min-h-0 w-full flex-col bg-zinc-900">
            <Tabs label={t("link.view")} tabs={tabs} />
        </section>
    );
}

export default LinkerView;
