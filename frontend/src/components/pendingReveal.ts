import { expansionReveal, type MacroBands } from "@/lib/simulator/macroBands";
import type { MacroReport } from "@/lib/simulator/ExecutionEvent";

export type RevealAction =
    | { editor: "source" | "output"; kind: "band"; index: number }
    | { editor: "source" | "output"; kind: "line"; line: number };

export interface RevealState {
    report: MacroReport | null;
    bands: MacroBands | null;
    // The split view can be shown (macros ran and MASMAPRG.ASM is not the active file).
    splitPossible: boolean;
    splitShown: boolean;
    outputMounted: boolean;
    // MASMAPRG.ASM is the active file: it sits in the main editor, with no split view.
    generatedActive: boolean;
    // The entry file is open in the source pane.
    sourceActive: boolean;
}

// Decides what a pending "reveal expansion" request does now. A request made
// before the output editor has mounted is kept until it has, then runs once.
export function resolvePendingReveal(
    pending: number | null,
    state: RevealState,
): { actions: RevealAction[]; pending: number | null } {
    const done = { actions: [], pending: null };
    if (pending === null) return done;
    const reveal = state.report && state.bands ? expansionReveal(state.report, pending) : null;
    if (!reveal) return done;

    if (state.generatedActive) {
        return { actions: [{ editor: "source", kind: "line", line: reveal.outputLine }], pending: null };
    }
    if (!state.splitPossible) return done;
    if (!state.splitShown || !state.outputMounted) return { actions: [], pending };

    const actions: RevealAction[] = reveal.bandIndex !== null
        ? [{ editor: "output", kind: "band", index: reveal.bandIndex }]
        : [{ editor: "output", kind: "line", line: reveal.outputLine }];
    if (state.sourceActive) {
        actions.push(reveal.bandIndex !== null
            ? { editor: "source", kind: "band", index: reveal.bandIndex }
            : { editor: "source", kind: "line", line: reveal.sourceLine });
    }
    return { actions, pending: null };
}
