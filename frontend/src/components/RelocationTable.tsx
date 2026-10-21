"use client";

import type { AssemblyRelocation } from "@/lib/simulator/ExecutionEvent";
import { hex } from "@/lib/simulator/hex";
import { modificationRecord, recordText } from "@/lib/simulator/ObjectProgram";
import { PanelMessage, PanelScroll, PanelSection } from "@/components/PanelSection";

// ============================================================
// Types
// ============================================================

export type RelocationTableProps = {
    // undefined when the assembler did not report its relocations.
    relocations: AssemblyRelocation[] | undefined;
    // The program's start, which the records are relative to; undefined when
    // the assembler did not report it, and then the records are left out.
    start: number | undefined;
};

// ============================================================
// RelocationTable
// ============================================================

// The address fields the loader must relocate, one Modification record each
// (Beck, Fig. 2.8): where the field starts and how many half-bytes it spans.
// The address is absolute, as in the listing; the record is relative to the
// start of the program, as the loader reads it.
export function RelocationTable({ relocations, start }: RelocationTableProps) {
    return (
        <PanelSection title="Modification records">
            {relocations === undefined || relocations.length === 0 ? (
                <PanelMessage>
                    {relocations === undefined
                        ? "The assembler did not report the program's relocations."
                        : "No modification records: no address in this program depends on where it is loaded."}
                </PanelMessage>
            ) : (
                <PanelScroll>
                    <table aria-label="Modification records" className="w-full text-xs">
                        <thead className="sticky top-0 bg-zinc-900 text-left text-zinc-400">
                            <tr>
                                <th scope="col" className="py-1 pr-3 font-medium">Address</th>
                                <th scope="col" className="py-1 pr-3 font-medium">Half-bytes</th>
                                {start !== undefined && <th scope="col" className="py-1 font-medium">Record</th>}
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                            {relocations.map((relocation, index) => (
                                <tr key={index} className="border-t border-zinc-800">
                                    <td className="py-1 pr-3 text-zinc-300">{hex(relocation.address, 6)}</td>
                                    <td className="py-1 pr-3 text-zinc-400">{relocation.halfBytes}</td>
                                    {start !== undefined && (
                                        <td className="py-1 text-zinc-400">
                                            {recordText(modificationRecord(relocation, start))}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </PanelScroll>
            )}
        </PanelSection>
    );
}

export default RelocationTable;
