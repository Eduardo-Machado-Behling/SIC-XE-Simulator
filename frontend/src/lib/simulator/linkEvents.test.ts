import { describe, expect, it } from "vitest";

import {
    linkReportFromEvents,
    normalizeExecutionEvent,
    normalizeExecutionEvents,
} from "@/lib/simulator/ExecutionEvent";
import { loadCommand } from "@/lib/transport/loadCommand";

const linked = (overrides: Record<string, unknown> = {}) => ({
    type: "ProgramLinked",
    details: {
        loadAddress: 4096,
        estab: [{ section: "PROG", symbol: "", address: 0, length: 8, file: "main.asm" }],
        objects: [{ source: "main.asm", text: "H PROG   000000 000008\n" }],
        out: { name: "PROG", text: "H PROG   000000 00000B\n", bands: [{ firstLine: 2, lastLine: 3, label: "main.asm · PROG" }] },
        trace: [{ pass: "1", text: "PROG placed at 000000", file: "main.asm", line: 1, address: 0, before: 0, after: 0, symbol: "PROG" }],
        ...overrides,
    },
});

describe("ProgramLinked events", () => {
    it("are accepted with the ESTAB, the object texts, the linked program and the trace", () => {
        const event = normalizeExecutionEvent(linked());
        expect(event.type).toBe("ProgramLinked");
        if (event.type !== "ProgramLinked") return;
        expect(event.details.loadAddress).toBe(4096);
        expect(event.details.out.name).toBe("PROG");
        expect(event.details.objects[0]).toEqual({ source: "main.asm", text: "H PROG   000000 000008\n" });
        expect(event.details.trace[0].pass).toBe("1");
    });

    it("are rejected when the linked program has no text", () => {
        expect(() => normalizeExecutionEvent(linked({ out: { name: "PROG", bands: [] } })))
            .toThrow(/ProgramLinked/);
        expect(() => normalizeExecutionEvent(linked({ estab: "none" }))).toThrow(/ProgramLinked/);
        expect(() => normalizeExecutionEvent(linked({ trace: [{ pass: "3" }] }))).toThrow(/ProgramLinked/);
    });

    it("are found as the last link report of a batch", () => {
        const events = normalizeExecutionEvents([linked({ loadAddress: 1 }), { type: "ProgramCleared" }, linked({ loadAddress: 2 })]);
        expect(linkReportFromEvents(events)?.loadAddress).toBe(2);
        expect(linkReportFromEvents([])).toBeNull();
    });
});

describe("events of linked programs", () => {
    it("keep the file of a fetched instruction", () => {
        const event = normalizeExecutionEvent({ type: "InstructionFetched", address: 8, value: [0x4f, 0, 0], source_line: 2, source_file: "sub.asm" });
        expect(event).toMatchObject({ source_file: "sub.asm", source_line: 2 });
        expect(() => normalizeExecutionEvent({ type: "InstructionFetched", address: 8, value: [0], source_file: 3 })).toThrow(TypeError);
    });

    it("keep the section and file of each symbol", () => {
        const event = normalizeExecutionEvent({
            type: "ProgramAssembled",
            details: { symbols: [{ name: "SUBB", value: 4104, section: "SUBB", file: "sub.asm" }] },
        });
        expect(event).toEqual({
            type: "ProgramAssembled",
            details: { symbols: [{ name: "SUBB", value: 4104, section: "SUBB", file: "sub.asm" }] },
        });
    });
});

describe("loadCommand", () => {
    it("names every file and the load address in hexadecimal", () => {
        expect(loadCommand(["a.asm", "b.asm"], 0x1000)).toBe("load @1000 %a.asm %b.asm");
    });

    it("leaves the address out when it is 0, as a single-file load always did", () => {
        expect(loadCommand(["a.asm"], 0)).toBe("load %a.asm");
        expect(loadCommand(["my file.asm"], 0)).toBe("load %my file.asm");
    });
});

describe("macroReportForFile", () => {
    it("picks the report of the given file among several", async () => {
        const { macroReportForFile } = await import("@/lib/simulator/ExecutionEvent");
        const { macroReportFixture } = await import("@/lib/simulator/macroFixtures");
        const events = [
            { type: "MacrosExpanded" as const, details: { ...macroReportFixture, source: "main.asm", text: "MAIN" } },
            { type: "MacrosExpanded" as const, details: { ...macroReportFixture, source: "sub.asm", text: "SUB" } },
        ];
        expect(macroReportForFile(events, "main.asm")?.text).toBe("MAIN");
        expect(macroReportForFile(events, "other.asm")?.text).toBe("SUB");  // a report without a match: the last
        expect(macroReportForFile([], "main.asm")).toBeNull();
    });
});
