import { describe, expect, it } from "vitest";

import {
    macroReportFromEvents,
    normalizeExecutionEvent,
    normalizeExecutionEvents,
    symbolsFromEvents,
} from "@/lib/simulator/ExecutionEvent";
import { macroReportFixture, rawMacroReportFixture } from "@/lib/simulator/macroFixtures";

const assembled = (symbols: unknown) => ({ type: "ProgramAssembled", details: { symbols } });

describe("ProgramAssembled events", () => {
    it("are accepted with their symbol table", () => {
        const event = normalizeExecutionEvent(assembled([{ name: "FIRST", value: 4096 }]));

        expect(event).toEqual({
            type: "ProgramAssembled",
            details: { symbols: [{ name: "FIRST", value: 4096 }] },
        });
    });

    it("are rejected when a symbol is malformed", () => {
        expect(() => normalizeExecutionEvent(assembled([{ name: "FIRST" }]))).toThrow(TypeError);
        expect(() => normalizeExecutionEvent(assembled([{ name: 7, value: 1 }]))).toThrow(TypeError);
        expect(() => normalizeExecutionEvent(assembled("FIRST"))).toThrow(TypeError);
    });
});

describe("symbolsFromEvents", () => {
    it("returns the symbol table of the last assembly in the batch", () => {
        const events = normalizeExecutionEvents([
            assembled([{ name: "OLD", value: 1 }]),
            { type: "InstructionExecuted", instruction: null },
            assembled([{ name: "NEW", value: 2 }]),
        ]);

        expect(symbolsFromEvents(events)).toEqual([{ name: "NEW", value: 2 }]);
    });

    it("returns null when the batch has no assembly, e.g. after loading a hex dump", () => {
        const events = normalizeExecutionEvents([{ type: "InstructionExecuted", instruction: null }]);

        expect(symbolsFromEvents(events)).toBeNull();
    });
});

const macrosExpanded = (details: unknown) => ({ type: "MacrosExpanded", details });

describe("MacrosExpanded events", () => {
    it("are accepted with their full report", () => {
        const event = normalizeExecutionEvent(macrosExpanded(rawMacroReportFixture));

        expect(event).toEqual({ type: "MacrosExpanded", details: macroReportFixture });
    });

    it("are rejected when the UI-read fields have the wrong shape", () => {
        const bad = (patch: Record<string, unknown>) =>
            () => normalizeExecutionEvent(macrosExpanded({ ...rawMacroReportFixture, ...patch }));

        expect(bad({ text: 5 })).toThrow(TypeError);
        expect(bad({ lineMap: "x" })).toThrow(TypeError);
        expect(bad({ lineMap: [{ output: 1 }] })).toThrow(TypeError);
        expect(bad({ expansions: {} })).toThrow(TypeError);
        expect(bad({ definitions: [null] })).toThrow(TypeError);
        expect(bad({ names: [{ name: 1 }] })).toThrow(TypeError);
        expect(bad({ trace: { truncated: false, steps: 3 } })).toThrow(TypeError);
        expect(bad({ hasMacros: "yes" })).toThrow(TypeError);
        expect(() => normalizeExecutionEvent({ type: "MacrosExpanded" })).toThrow(TypeError);
    });
});

describe("macroReportFromEvents", () => {
    it("returns the last report in the batch, or null", () => {
        const first = { ...rawMacroReportFixture, text: "first\n" };
        const events = normalizeExecutionEvents([
            macrosExpanded(first),
            macrosExpanded(rawMacroReportFixture),
            { type: "MemoryCleared" },
        ]);

        expect(macroReportFromEvents(events)).toEqual(macroReportFixture);
        expect(macroReportFromEvents(normalizeExecutionEvents([{ type: "MemoryCleared" }]))).toBeNull();
    });
});
