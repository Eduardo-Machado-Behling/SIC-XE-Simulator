"use client";

import type { AssemblyListingLine } from "@/lib/simulator/ExecutionEvent";
import { hex, hexBytes } from "@/lib/simulator/hex";
import { PanelMessage, PanelScroll, PanelSection } from "@/components/PanelSection";

// ============================================================
// Types
// ============================================================

export type ListingTableProps = {
    // undefined when the assembler did not report a listing.
    listing: AssemblyListingLine[] | undefined;
    // The statement whose object code holds this address is marked.
    pc?: number;
};

// ============================================================
// ListingTable
// ============================================================

const holds = (line: AssemblyListingLine, address: number) =>
    line.address !== null && address >= line.address && address < line.address + line.bytes.length;

// The assembler listing in the columns of Beck's Fig. 2.6: the source line,
// the location pass 1 gave the statement and the object code pass 2 made.
export function ListingTable({ listing, pc }: ListingTableProps) {
    return (
        <PanelSection title="Listing">
            {listing === undefined || listing.length === 0 ? (
                <PanelMessage>
                    {listing === undefined
                        ? "The assembler did not report a listing for this program."
                        : "The program has no statements."}
                </PanelMessage>
            ) : (
                <PanelScroll>
                    <table aria-label="Listing" className="w-full text-xs">
                        <thead className="sticky top-0 bg-zinc-900 text-left text-zinc-400">
                            <tr>
                                <th scope="col" className="py-1 pr-3 text-right font-medium">Line</th>
                                <th scope="col" className="py-1 pr-3 font-medium">Loc</th>
                                <th scope="col" className="py-1 pr-3 font-medium">Source statement</th>
                                <th scope="col" className="py-1 font-medium">Object code</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                            {listing.map((line, index) => {
                                const current = pc !== undefined && holds(line, pc);

                                return (
                                    <tr
                                        key={index}
                                        aria-current={current ? "true" : undefined}
                                        className={`border-t border-zinc-800 ${current ? "bg-blue-500/15" : ""}`}
                                    >
                                        <td className="py-1 pr-3 text-right text-zinc-500">{line.line}</td>
                                        <td className={`py-1 pr-3 ${current ? "text-blue-300" : "text-zinc-400"}`}>
                                            {line.address === null ? "" : hex(line.address, 6)}
                                        </td>
                                        <td className="py-1 pr-3 whitespace-pre text-zinc-300">{line.source}</td>
                                        <td className="py-1 break-all text-zinc-400">{hexBytes(line.bytes)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </PanelScroll>
            )}
        </PanelSection>
    );
}

export default ListingTable;
