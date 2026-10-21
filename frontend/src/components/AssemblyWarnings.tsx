"use client";

import type { AssemblyDiagnostic } from "@/lib/simulator/ExecutionEvent";
import { PanelMessage, PanelScroll, PanelSection } from "@/components/PanelSection";

// ============================================================
// Types
// ============================================================

export type AssemblyWarningsProps = {
    // undefined when the assembler did not report its diagnostics.
    diagnostics: AssemblyDiagnostic[] | undefined;
};

// ============================================================
// AssemblyWarnings
// ============================================================

function position(diagnostic: AssemblyDiagnostic): string {
    return diagnostic.column > 0
        ? `Line ${diagnostic.line}, column ${diagnostic.column}`
        : `Line ${diagnostic.line}`;
}

// The warnings of a program that assembled; a failed assembly has no report.
export function AssemblyWarnings({ diagnostics }: AssemblyWarningsProps) {
    return (
        <PanelSection title="Warnings">
            {diagnostics === undefined || diagnostics.length === 0 ? (
                <PanelMessage>
                    {diagnostics === undefined
                        ? "The assembler did not report its warnings for this program."
                        : "No warnings."}
                </PanelMessage>
            ) : (
                <PanelScroll>
                    <ul aria-label="Warnings" className="space-y-1 text-xs">
                        {diagnostics.map((diagnostic, index) => (
                            <li key={index} className="border-t border-zinc-800 py-1 text-zinc-300">
                                <span className="font-mono text-amber-400">{position(diagnostic)}</span>
                                {": "}
                                {diagnostic.message}
                            </li>
                        ))}
                    </ul>
                </PanelScroll>
            )}
        </PanelSection>
    );
}

export default AssemblyWarnings;
