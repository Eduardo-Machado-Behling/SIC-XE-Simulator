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

    // Spec: a source without macros behaves exactly as before the processor existed.
    it("writes nothing when the source had no macros", () => {
        const details = { ...macroReportFixture, hasMacros: false, expansions: [] };

        expect(eventLines({ type: "MacrosExpanded", details })).toEqual([]);
    });

    it("still reports a failure of a source without macros", () => {
        const details = { ...macroReportFixture, ok: false, hasMacros: false, expansions: [] };

        expect(eventLines({ type: "MacrosExpanded", details })).toEqual([
            { text: "Macro processor failed · MASMAPRG.ASM", level: "error" },
        ]);
    });

    it("uses the error level when the macro processor failed", () => {
        const details = { ...macroReportFixture, ok: false };

        expect(eventLines({ type: "MacrosExpanded", details })).toEqual([
            { text: "Macro processor failed · MASMAPRG.ASM", level: "error" },
        ]);
    });
});

describe("Console eventLines for ProgramLinked", () => {
    const report = (estab: { section: string; symbol: string }[], loadAddress: number) => ({
        loadAddress,
        estab: estab.map((row) => ({ ...row, address: 0, length: 0, file: "main.asm" })),
        objects: [],
        out: { name: "PROG", text: "", bands: [] },
        trace: [],
    });

    it("summarizes the linked sections and the load address", () => {
        const details = report([{ section: "PROG", symbol: "" }, { section: "PROG", symbol: "N" }, { section: "SUBB", symbol: "" }], 0x1000);
        expect(eventLines({ type: "ProgramLinked", details })).toEqual([
            { text: "Linker · 2 sections · loaded at 0x01000 · PROG", level: "success" },
        ]);
    });

    it("writes nothing for a single section at address 0, as before the linker existed", () => {
        expect(eventLines({ type: "ProgramLinked", details: report([{ section: "PROG", symbol: "" }], 0) })).toEqual([]);
    });
});
