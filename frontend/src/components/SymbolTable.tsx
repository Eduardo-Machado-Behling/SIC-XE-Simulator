"use client";

import type { AssemblySymbol } from "@/lib/simulator/ExecutionEvent";

// ============================================================
// Types
// ============================================================

export type SymbolTableProps = {
    // null until the assembler has produced a symbol table.
    symbols: AssemblySymbol[] | null;
};

// ============================================================
// SymbolTable
// ============================================================

function address(value: number): string {
    return value.toString(16).toUpperCase().padStart(6, "0");
}

export function SymbolTable({ symbols }: SymbolTableProps) {
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
                Symbol table
            </div>

            {symbols === null || symbols.length === 0 ? (
                <p role="status" className="px-3 text-xs text-zinc-500">
                    {symbols === null
                        ? "Nothing assembled yet. Run an assembly program to see its symbols."
                        : "The assembled program defines no symbols."}
                </p>
            ) : (
                <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
                    <table aria-label="Symbol table" className="w-full text-xs">
                        <thead className="sticky top-0 bg-zinc-900 text-left text-zinc-400">
                            <tr>
                                <th scope="col" className="py-1 font-medium">Symbol</th>
                                <th scope="col" className="py-1 font-medium">Address</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                            {symbols.map((symbol) => (
                                <tr key={symbol.name} className="border-t border-zinc-800">
                                    <td className="py-1 text-zinc-300">{symbol.name}</td>
                                    <td className="py-1 text-zinc-400">{address(symbol.value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

export default SymbolTable;
