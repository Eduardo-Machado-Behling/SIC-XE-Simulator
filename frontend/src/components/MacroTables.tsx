"use client";

import type { KeyboardEvent } from "react";

import type { MacroActual, MacroDefinition, MacroReport } from "@/lib/simulator/ExecutionEvent";

// ============================================================
// Types
// ============================================================

export type MacroTablesProps = {
    report: MacroReport;
    // Called with the serial of the expansion whose row was activated.
    onSelectExpansion: (serial: number) => void;
};

// ============================================================
// Helpers
// ============================================================

// `#0=INICIO #1=N`: the index of each actual, `#0` being the label formal.
function formatArguments(actuals: MacroActual[]): string {
    return actuals.map((actual) => `#${actual.index}=${actual.value}`).join(" ");
}

function definitionHeader(definition: MacroDefinition): string {
    const origin = definition.origin.kind === "source"
        ? `defined at line ${definition.origin.line}`
        : `created by expansion #${String(definition.origin.serial).padStart(3, "0")}`;
    return `${definition.name} — ${origin}`;
}

const HEAD = "sticky top-0 bg-zinc-900 text-left text-zinc-400";

function SectionTitle({ children }: { children: string }) {
    return <h3 className="pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">{children}</h3>;
}

// ============================================================
// MacroTables
// ============================================================

export function MacroTables({ report, onSelectExpansion }: MacroTablesProps) {
    const onRowKey = (event: KeyboardEvent, serial: number) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectExpansion(serial);
        }
    };

    return (
        <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
            <SectionTitle>Macros</SectionTitle>
            <table aria-label="Macro name table" className="w-full text-xs">
                <thead className={HEAD}>
                    <tr>
                        <th scope="col" className="py-1 font-medium">Name</th>
                        <th scope="col" className="py-1 font-medium">Prototype</th>
                        <th scope="col" className="py-1 font-medium">Lines</th>
                    </tr>
                </thead>
                <tbody className="font-mono">
                    {report.names.map((entry) => {
                        const definition = report.definitions[entry.definition];
                        // From the MCDEFN line to the MCEND line, like the definition header.
                        const first = definition?.origin.kind === "source" ? definition.origin.line : entry.line;
                        const last = definition?.body.at(-1)?.line;
                        // Line 0: the macro was created by an expansion, not written in the source.
                        const lines = entry.line === 0
                            ? (definition?.origin.kind === "expansion" ? `#${String(definition.origin.serial).padStart(3, "0")}` : "")
                            : last != null && last !== first ? `${first}-${last}` : first;
                        return (
                            <tr key={entry.name} className="border-t border-zinc-800">
                                <td className="py-1 text-zinc-300">{entry.name}</td>
                                <td className="py-1 text-zinc-400">{definition?.prototype}</td>
                                <td className="py-1 text-zinc-400">
                                    {lines}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <SectionTitle>Definitions</SectionTitle>
            {report.definitions.map((definition) => (
                <div
                    key={definition.index}
                    role="group"
                    aria-label={definitionHeader(definition)}
                    className={`mb-2 ${definition.active ? "" : "opacity-50"}`}
                >
                    <div className="flex items-center gap-2 text-xs text-zinc-300">
                        <span className="font-medium">{definitionHeader(definition)}</span>
                        {!definition.active && (
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">redefined</span>
                        )}
                    </div>
                    {/* Fixed layout: the number column is 2rem in every definition,
                        and a long line is cut instead of widening the panel. */}
                    <table aria-label={`${definition.name} definition ${definition.index} body`} className="w-full table-fixed text-xs">
                        <tbody className="font-mono">
                            {definition.body.map((line, position) => (
                                <tr key={position} className="border-t border-zinc-800">
                                    <td className="w-8 py-1 pr-2 text-right text-zinc-500">{position + 1}</td>
                                    <td className="py-1 text-zinc-300">
                                        <span className="block overflow-hidden text-ellipsis whitespace-pre" title={line.text}>{line.text}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}

            <SectionTitle>Expansions</SectionTitle>
            <table aria-label="Macro expansion table" className="w-full text-xs">
                <thead className={HEAD}>
                    <tr>
                        <th scope="col" className="py-1 font-medium">#</th>
                        <th scope="col" className="py-1 font-medium">Macro</th>
                        <th scope="col" className="py-1 font-medium">Arguments</th>
                        <th scope="col" className="py-1 font-medium">Output</th>
                    </tr>
                </thead>
                <tbody className="font-mono">
                    {report.expansions.map((expansion) => (
                        <tr
                            key={expansion.serial}
                            tabIndex={0}
                            onClick={() => onSelectExpansion(expansion.serial)}
                            onKeyDown={(event) => onRowKey(event, expansion.serial)}
                            className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-800 focus-visible:bg-zinc-800 focus-visible:outline-none"
                        >
                            <td className="py-1 text-zinc-500">{String(expansion.serial).padStart(3, "0")}</td>
                            <td className="py-1 text-zinc-300" style={{ paddingLeft: `${expansion.depth - 1}rem` }}>{expansion.macro}</td>
                            <td className="py-1 text-zinc-400">{formatArguments(expansion.actuals)}</td>
                            <td className="py-1 text-zinc-400">{expansion.output.from}-{expansion.output.to}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default MacroTables;
