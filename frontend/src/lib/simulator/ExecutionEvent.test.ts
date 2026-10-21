import { describe, expect, it } from "vitest";

import {
    assemblyFromEvents,
    normalizeExecutionEvent,
    normalizeExecutionEvents,
    symbolsFromEvents,
} from "@/lib/simulator/ExecutionEvent";

const assembled = (symbols: unknown) => ({ type: "ProgramAssembled", details: { symbols } });

// The full report, as SICXE::load_file sends it for Beck's Fig. 2.5 (abridged).
const report = () => ({
    symbols: [{ name: "FIRST", value: 0 }],
    program: { name: "COPY", start: 0, length: 0x1077, entry: 0 },
    listing: [
        { line: 1, address: 0, bytes: [], source: "COPY     START   0" },
        { line: 2, address: 0, bytes: [0x17, 0x20, 0x2D], source: "FIRST    STL     RETADR" },
        { line: 4, address: null, bytes: [], source: "         BASE    LENGTH" },
    ],
    relocations: [{ address: 7, halfBytes: 5 }],
    diagnostics: [{ severity: "warning", line: 9, column: 3, message: "Something to look at" }],
});

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

describe("ProgramAssembled events with the full assembly report", () => {
    it("keep the program, listing, relocations and warnings", () => {
        const event = normalizeExecutionEvent({ type: "ProgramAssembled", details: report() });

        expect(event).toEqual({ type: "ProgramAssembled", details: report() });
    });

    it("drop fields outside the contract", () => {
        const details = { ...report(), extra: 1, program: { ...report().program, extra: 2 } };

        const event = normalizeExecutionEvent({ type: "ProgramAssembled", details });

        expect(event).toEqual({ type: "ProgramAssembled", details: report() });
    });

    it("still accept the symbols-only payload, reporting nothing else", () => {
        const event = normalizeExecutionEvent(assembled([{ name: "FIRST", value: 1 }]));

        expect(event.type === "ProgramAssembled" && event.details).toStrictEqual({
            symbols: [{ name: "FIRST", value: 1 }],
        });
    });

    it.each([
        ["a program without a length", { program: { name: "COPY", start: 0, entry: 0 } }],
        ["a negative start", { program: { name: "COPY", start: -1, length: 0, entry: 0 } }],
        ["a listing that is not an array", { listing: "0000 17202D" }],
        ["a listing line without a source", { listing: [{ line: 1, address: 0, bytes: [] }] }],
        ["a listing address that is a string", { listing: [{ line: 1, address: "0", bytes: [], source: "" }] }],
        ["object code that is not bytes", { listing: [{ line: 1, address: 0, bytes: [256], source: "" }] }],
        ["a fractional line number", { listing: [{ line: 1.5, address: 0, bytes: [], source: "" }] }],
        ["a relocation without a length", { relocations: [{ address: 7 }] }],
        ["an unknown severity", { diagnostics: [{ severity: "info", line: 1, column: 0, message: "x" }] }],
        ["a diagnostic without a message", { diagnostics: [{ severity: "warning", line: 1, column: 0 }] }],
    ])("are rejected for %s", (_, broken) => {
        const event = { type: "ProgramAssembled", details: { ...report(), ...broken } };

        expect(() => normalizeExecutionEvent(event)).toThrow(TypeError);
    });
});

describe("assemblyFromEvents", () => {
    it("returns the report of the last assembly in the batch", () => {
        const events = normalizeExecutionEvents([
            assembled([{ name: "OLD", value: 1 }]),
            { type: "ProgramAssembled", details: report() },
        ]);

        expect(assemblyFromEvents(events)).toEqual(report());
    });

    it("returns null when the batch has no assembly", () => {
        expect(assemblyFromEvents(normalizeExecutionEvents([]))).toBeNull();
    });

    it("returns null when the batch discards the assembly after it, as clear does", () => {
        const events = normalizeExecutionEvents([
            { type: "ProgramAssembled", details: report() },
            { type: "ProgramCleared" },
        ]);

        expect(assemblyFromEvents(events)).toBeNull();
    });

    it("returns the report of a load, which clears the previous program first", () => {
        const events = normalizeExecutionEvents([
            { type: "MemoryCleared" },
            { type: "ProgramCleared" },
            { type: "ProgramAssembled", details: report() },
        ]);

        expect(assemblyFromEvents(events)).toEqual(report());
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
