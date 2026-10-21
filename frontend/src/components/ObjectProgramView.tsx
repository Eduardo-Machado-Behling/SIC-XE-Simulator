"use client";

import { useMemo } from "react";

import type { AssemblyReport } from "@/lib/simulator/ExecutionEvent";
import { objectProgram, recordFields } from "@/lib/simulator/ObjectProgram";
import { PanelMessage, PanelScroll, PanelSection } from "@/components/PanelSection";

// ============================================================
// Types
// ============================================================

export type ObjectProgramViewProps = {
    report: AssemblyReport;
};

// ============================================================
// ObjectProgramView
// ============================================================

// The object program the assembler's output amounts to, one record per line
// as in Beck's Fig. 2.8. The fields are set apart by spacing where the book
// prints ^, so a copied line is the record itself.
export function ObjectProgramView({ report }: ObjectProgramViewProps) {
    const { program, listing, relocations } = report;
    const records = useMemo(
        () => (program && listing && relocations ? objectProgram({ program, listing, relocations }) : null),
        [program, listing, relocations],
    );

    return (
        <PanelSection title="Object program">
            {records === null ? (
                <PanelMessage>
                    The assembler did not report the program summary, listing and relocations an object program
                    is built from.
                </PanelMessage>
            ) : (
                <PanelScroll>
                    <ol aria-label="Object program" className="space-y-1 font-mono text-xs">
                        {records.map((record, index) => {
                            const [type, ...fields] = recordFields(record);

                            return (
                                <li key={index} className="flex flex-wrap gap-x-1.5 break-all text-zinc-300">
                                    <span className="font-semibold text-blue-400">{type}</span>
                                    {fields.map((field, position) => (
                                        <span key={position}>{field}</span>
                                    ))}
                                </li>
                            );
                        })}
                    </ol>
                </PanelScroll>
            )}
        </PanelSection>
    );
}

export default ObjectProgramView;
