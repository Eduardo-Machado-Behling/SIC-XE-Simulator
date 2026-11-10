"use client";

import { useEffect, useRef, useState } from "react";

import type { MacroReport, MacroTraceStep } from "@/lib/simulator/ExecutionEvent";
import type { TraceLine } from "@/lib/simulator/macroBands";

// ============================================================
// Types
// ============================================================

export type MacroTraceProps = {
    report: MacroReport;
    // Called when the current step points at a line of the source or of MASMAPRG.ASM.
    onSelectLine: (target: TraceLine) => void;
};

type Mode = "Normal" | "Definition" | "Expansion";

const MODES: Mode[] = ["Normal", "Definition", "Expansion"];

// ============================================================
// Helpers
// ============================================================

function modeOf(step: MacroTraceStep): Mode {
    if (step.d > 0 || step.action === "define-start") return "Definition";
    return step.e ? "Expansion" : "Normal";
}

function formatRead(step: MacroTraceStep): string {
    if (step.read.from === "source") return `line ${step.read.line}`;
    return `#${String(step.read.serial).padStart(3, "0")} · line ${step.read.bodyLine}`;
}

function formatExpansionFlag(step: MacroTraceStep): string {
    if (!step.e) return "false";
    return step.depth > 1 ? `true ×${step.depth}` : "true";
}

function formatTarget(step: MacroTraceStep, report: MacroReport): string | null {
    const target = step.target;
    if (!target) return null;
    if ("output" in target) return `→ output ${target.output}`;
    if ("definition" in target) {
        const name = report.definitions[target.definition]?.name ?? `#${target.definition}`;
        return `→ ${name} line ${target.bodyLine}`;
    }
    return `→ expansion #${String(target.serial).padStart(3, "0")}`;
}

// A source read points at its source line; a copy points at the output line it produced.
function lineOf(step: MacroTraceStep): TraceLine | null {
    if (step.action === "copy" && step.target && "output" in step.target) {
        return { file: "output", line: step.target.output };
    }
    if (step.read.from === "source") return { file: "source", line: step.read.line };
    return null;
}

// ============================================================
// MacroTrace
// ============================================================

export function MacroTrace({ report, onSelectLine }: MacroTraceProps) {
    const { steps, truncated } = report.trace;
    const [current, setCurrent] = useState(0);
    const currentRow = useRef<HTMLTableRowElement | null>(null);

    // A new Run brings a new report: start again from the first step.
    const [shown, setShown] = useState(report);
    if (shown !== report) {
        setShown(report);
        setCurrent(0);
    }

    useEffect(() => {
        currentRow.current?.scrollIntoView?.({ block: "nearest" });
    }, [current]);

    if (steps.length === 0) {
        return <p role="status" className="px-3 py-3 text-xs text-zinc-500">No trace steps</p>;
    }

    const index = Math.min(current, steps.length - 1);
    const lit = modeOf(steps[index]);

    const goTo = (next: number) => {
        const clamped = Math.max(0, Math.min(steps.length - 1, next));
        if (clamped === index) return;
        setCurrent(clamped);
        const target = lineOf(steps[clamped]);
        if (target) onSelectLine(target);
    };

    const button = "rounded border border-zinc-700 px-2 py-0.5 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent";

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {truncated && (
                <p role="alert" className="px-3 py-1 text-xs text-amber-400">Trace truncated at 5000 steps</p>
            )}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <button type="button" aria-label="Previous step" className={button} disabled={index === 0} onClick={() => goTo(index - 1)}>◀</button>
                <input
                    type="range"
                    aria-label="Trace step"
                    min={1}
                    max={steps.length}
                    value={index + 1}
                    onChange={(event) => goTo(Number(event.target.value) - 1)}
                    className="min-w-24 flex-1"
                />
                <button type="button" aria-label="Next step" className={button} disabled={index === steps.length - 1} onClick={() => goTo(index + 1)}>▶</button>
                <span className="text-zinc-400">{index + 1} / {steps.length}</span>
                <ul aria-label="Mode" className="flex gap-1">
                    {MODES.map((mode) => (
                        <li
                            key={mode}
                            aria-current={mode === lit ? "true" : undefined}
                            className={`rounded px-2 py-0.5 ${mode === lit ? "bg-sky-700 text-white" : "bg-zinc-800 text-zinc-500"}`}
                        >
                            {mode}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
                {/* Every column but Text keeps its width and never wraps; Text
                    takes what is left and is cut with an ellipsis, so Action
                    stays on screen in the ~420px panel (at 12px the other
                    columns of the demo alone are wider than that). */}
                <table aria-label="Macro processor trace" className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-zinc-900 text-left text-zinc-400">
                        <tr>
                            <th scope="col" className="py-1 pr-2 font-medium">Step</th>
                            <th scope="col" className="py-1 pr-2 font-medium">Read</th>
                            <th scope="col" className="py-1 pr-2 font-medium">d</th>
                            <th scope="col" className="py-1 pr-2 font-medium">e</th>
                            <th scope="col" className="w-full py-1 pr-2 font-medium">
                                <span className="block w-0 min-w-full overflow-hidden text-ellipsis whitespace-nowrap">Text</span>
                            </th>
                            <th scope="col" className="py-1 font-medium">Action</th>
                        </tr>
                    </thead>
                    <tbody className="font-mono text-zinc-200">
                        {steps.map((step, i) => (
                            <tr
                                key={step.step}
                                ref={i === index ? currentRow : undefined}
                                aria-current={i === index ? "step" : undefined}
                                className={i === index ? "bg-sky-900/50" : undefined}
                            >
                                <td className="py-0.5 pr-2">{step.step}</td>
                                <td className="pr-2 whitespace-nowrap">{formatRead(step)}</td>
                                <td className="pr-2">{step.d}</td>
                                <td className="pr-2 whitespace-nowrap">{formatExpansionFlag(step)}</td>
                                <td className="pr-2">
                                    {/* Zero intrinsic width: the line never widens the table. */}
                                    <span className="block w-0 min-w-full overflow-hidden text-ellipsis whitespace-pre" title={step.text}>
                                        {step.text}
                                    </span>
                                </td>
                                <td className="whitespace-nowrap">{step.action} <span className="text-zinc-400">{formatTarget(step, report)}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default MacroTrace;
