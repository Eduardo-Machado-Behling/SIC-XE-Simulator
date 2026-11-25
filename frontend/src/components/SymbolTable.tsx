"use client";

import { Fragment } from "react";

import { useT } from "@/lib/i18n";
import type { AssemblySymbol } from "@/lib/simulator/ExecutionEvent";

// ============================================================
// Types
// ============================================================

export type SymbolTableProps = {
    // null when no symbol table is available: before the first run, or after
    // a run whose events carried none.
    symbols: AssemblySymbol[] | null;
};

// ============================================================
// SymbolTable
// ============================================================

const WORD = 0x1000000; // a SIC/XE word is 24 bits

// Six hex digits, the width of a SIC/XE word. A negative EQU value is shown as
// the 24-bit two's complement the assembler would store.
function hexValue(value: number): string {
    const word = value < 0 ? ((value % WORD) + WORD) % WORD : value;
    return word.toString(16).toUpperCase().padStart(6, "0");
}

export function SymbolTable({ symbols }: SymbolTableProps) {
    const t = useT();
    return (
        <section className="flex h-full min-h-0 w-full flex-col bg-zinc-900">
            <div
                className="
                    h-10
                    shrink-0
                    px-3
                    flex
                    items-center
                    text-xs
                    font-semibold
                    uppercase
                    tracking-wide
                    text-zinc-400
                "
            >
                <h2>{t("asm.symbolTable")}</h2>
            </div>

            {symbols === null || symbols.length === 0 ? (
                <p role="status" className="px-3 text-xs text-zinc-400">
                    {symbols === null
                        ? t("asm.noSymbols")
                        : t("asm.emptySymbols")}
                </p>
            ) : (
                <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
                    <table aria-label={t("asm.symbolTable")} className="w-full text-xs">
                        <thead className="sticky top-0 bg-zinc-900 text-left text-zinc-400">
                            <tr>
                                <th scope="col" className="py-1 font-medium">{t("asm.symbol")}</th>
                                <th scope="col" className="py-1 font-medium">{t("asm.value")}</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                            {symbols.map((symbol, index) => {
                                // A linked program: a header row before each control section's labels.
                                const group = symbol.section ? `${symbol.section} · ${symbol.file ?? ""}` : null;
                                const previous = symbols[index - 1];
                                const newGroup = group !== null && (!previous || `${previous.section} · ${previous.file ?? ""}` !== group);
                                return (
                                    <Fragment key={`${group ?? ""}:${symbol.name}`}>
                                        {newGroup && (
                                            <tr>
                                                <th scope="rowgroup" colSpan={2} role="rowheader" className="pt-2 pb-1 text-left font-sans font-semibold text-zinc-400">
                                                    {group}
                                                </th>
                                            </tr>
                                        )}
                                        <tr className="border-t border-zinc-800">
                                            <td className="py-1 text-zinc-300">{symbol.name}</td>
                                            <td className="py-1 text-zinc-400">{hexValue(symbol.value)}</td>
                                        </tr>
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

export default SymbolTable;
