import { describe, expect, it } from "vitest";

import { eventLines } from "@/components/Console";
import { macroReportFixture } from "@/lib/simulator/macroFixtures";

describe("Console eventLines for MacrosExpanded", () => {
    it("summarizes the expansions and the generated file", () => {
        const expansion = macroReportFixture.expansions[0];
        const details = { ...macroReportFixture, expansions: Array(5).fill(expansion) };

        expect(eventLines({ type: "MacrosExpanded", details })).toEqual([
            { text: "Macro processor · 5 expansions · MASMAPRG.ASM", level: "success" },
        ]);
    });

    it("uses the singular for one expansion", () => {
        const details = { ...macroReportFixture, expansions: [macroReportFixture.expansions[0]] };

        expect(eventLines({ type: "MacrosExpanded", details })).toEqual([
            { text: "Macro processor · 1 expansion · MASMAPRG.ASM", level: "success" },
        ]);
    });

    it("says there were no macros when the source had none", () => {
        const details = { ...macroReportFixture, hasMacros: false, expansions: [] };

        expect(eventLines({ type: "MacrosExpanded", details })).toEqual([
            { text: "Macro processor · no macros", level: "info" },
        ]);
    });
});
