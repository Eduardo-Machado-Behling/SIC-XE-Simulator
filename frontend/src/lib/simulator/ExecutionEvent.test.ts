import { describe, expect, it } from "vitest";

import {
    normalizeExecutionEvent,
    normalizeExecutionEvents,
    symbolsFromEvents,
} from "@/lib/simulator/ExecutionEvent";

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
