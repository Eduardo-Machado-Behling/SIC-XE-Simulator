import { describe, expect, it } from "vitest";

import { resolvePendingLine, resolvePendingReveal, type RevealState } from "@/components/pendingReveal";
import { macroBands } from "@/lib/simulator/macroBands";
import { macroReportFixture } from "@/lib/simulator/macroFixtures";

const base: RevealState = {
    report: macroReportFixture,
    bands: macroBands(macroReportFixture),
    splitPossible: true,
    splitShown: true,
    outputMounted: true,
    generatedActive: false,
    sourceActive: true,
};
const topLevel = macroReportFixture.expansions.find((expansion) => expansion.parent === null)!;
const nested = macroReportFixture.expansions.find((expansion) => expansion.parent !== null);

describe("resolvePendingReveal", () => {
    it("does nothing without a request", () => {
        expect(resolvePendingReveal(null, base)).toEqual({ actions: [], pending: null });
    });

    it("keeps a request made before the output editor mounted, then runs it once", () => {
        const early = resolvePendingReveal(topLevel.serial, { ...base, outputMounted: false });
        expect(early).toEqual({ actions: [], pending: topLevel.serial });

        const mounted = resolvePendingReveal(early.pending, base);
        expect(mounted.actions.length).toBeGreaterThan(0);
        expect(mounted.pending).toBeNull();

        expect(resolvePendingReveal(mounted.pending, base).actions).toEqual([]);
    });

    it("keeps a request while the split view is still opening", () => {
        const result = resolvePendingReveal(topLevel.serial, { ...base, splitShown: false, outputMounted: false });
        expect(result.pending).toBe(topLevel.serial);
    });

    it("reveals the band on both sides for a top-level expansion", () => {
        const { actions } = resolvePendingReveal(topLevel.serial, base);
        expect(actions).toEqual([
            { editor: "output", kind: "band", index: 0 },
            { editor: "source", kind: "band", index: 0 },
        ]);
    });

    it("reveals only the output band when another file is open in the source pane", () => {
        const { actions } = resolvePendingReveal(topLevel.serial, { ...base, sourceActive: false });
        expect(actions).toEqual([{ editor: "output", kind: "band", index: 0 }]);
    });

    it("reveals lines for a nested expansion", () => {
        if (!nested) return;
        const { actions } = resolvePendingReveal(nested.serial, base);
        expect(actions[0]).toEqual({ editor: "output", kind: "line", line: nested.output.from });
    });

    it("reveals output.from in the active editor when MASMAPRG.ASM is the active file", () => {
        const state = { ...base, generatedActive: true, splitPossible: false, splitShown: false, outputMounted: false, sourceActive: false };
        const result = resolvePendingReveal(topLevel.serial, state);
        expect(result.actions).toEqual([{ editor: "source", kind: "line", line: topLevel.output.from }]);
        expect(result.pending).toBeNull();
    });

    it("drops a request that can never be shown", () => {
        expect(resolvePendingReveal(topLevel.serial, { ...base, splitPossible: false, splitShown: false, outputMounted: false }))
            .toEqual({ actions: [], pending: null });
        expect(resolvePendingReveal(topLevel.serial, { ...base, bands: null }))
            .toEqual({ actions: [], pending: null });
        expect(resolvePendingReveal(99999, base)).toEqual({ actions: [], pending: null });
    });
});

describe("resolvePendingLine", () => {
    const output = { file: "output", line: 7 } as const;
    const source = { file: "source", line: 3 } as const;

    it("does nothing without a request", () => {
        expect(resolvePendingLine(null, base)).toEqual({ actions: [], pending: null });
    });

    it("keeps an output request until the split view is shown and mounted, then runs it once", () => {
        expect(resolvePendingLine(output, { ...base, outputMounted: false }))
            .toEqual({ actions: [], pending: output });
        expect(resolvePendingLine(output, { ...base, splitShown: false }))
            .toEqual({ actions: [], pending: output });
        expect(resolvePendingLine(output, base))
            .toEqual({ actions: [{ editor: "output", kind: "line", line: 7 }], pending: null });
    });

    it("reveals the output line in the main editor when MASMAPRG.ASM is the active file", () => {
        expect(resolvePendingLine(output, { ...base, generatedActive: true, splitPossible: false, splitShown: false }))
            .toEqual({ actions: [{ editor: "source", kind: "line", line: 7 }], pending: null });
    });

    it("reveals a source line only while the entry file is open in the source pane", () => {
        expect(resolvePendingLine(source, base))
            .toEqual({ actions: [{ editor: "source", kind: "line", line: 3 }], pending: null });
        expect(resolvePendingLine(source, { ...base, sourceActive: false })).toEqual({ actions: [], pending: null });
        expect(resolvePendingLine(source, { ...base, generatedActive: true, sourceActive: false }))
            .toEqual({ actions: [], pending: null });
    });

    it("drops the request once the entry file was edited", () => {
        expect(resolvePendingLine(output, { ...base, bands: null })).toEqual({ actions: [], pending: null });
        expect(resolvePendingLine(source, { ...base, bands: null })).toEqual({ actions: [], pending: null });
    });

    it("drops an output request when no split view is possible", () => {
        expect(resolvePendingLine(output, { ...base, splitPossible: false })).toEqual({ actions: [], pending: null });
    });
});
