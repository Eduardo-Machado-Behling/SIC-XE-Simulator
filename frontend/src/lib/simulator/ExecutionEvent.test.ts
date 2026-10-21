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

describe("MemoryCleared events", () => {
    it("are accepted without a payload", () => {
        expect(normalizeExecutionEvent({ type: "MemoryCleared" })).toEqual({ type: "MemoryCleared" });
    });

    it("drop any extra field, so no memory contents travel with them", () => {
        expect(normalizeExecutionEvent({ type: "MemoryCleared", value: [1, 2, 3] })).toEqual({ type: "MemoryCleared" });
    });

    it("keep their place in the batch", () => {
        const events = normalizeExecutionEvents([
            { type: "MemoryCleared" },
            { type: "MemoryWrite", address: 4096, value: [1, 0, 5], old_value: [0, 0, 0] },
        ]);

        expect(events.map((event) => event.type)).toEqual(["MemoryCleared", "MemoryWrite"]);
    });
});
