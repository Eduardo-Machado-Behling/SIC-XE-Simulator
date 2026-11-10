import { describe, expect, it } from "vitest";

import { macroReportFromEvents, normalizeExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import type { MacroReport } from "@/lib/simulator/ExecutionEvent";
import { macroBands, sourceLineForOutput } from "@/lib/simulator/macroBands";
import demoPayload from "@/lib/simulator/__fixtures__/macros-demo.json";
import fig412Payload from "@/lib/simulator/__fixtures__/macros-fig412.json";

// Real MacrosExpanded details captured from the backend.
const payloads: [string, unknown][] = [
    ["demo", demoPayload],
    ["fig412", fig412Payload],
];

function demoReport(): MacroReport {
    const event = normalizeExecutionEvent({ type: "MacrosExpanded", details: demoPayload });
    const report = macroReportFromEvents([event]);
    if (!report) throw new Error("demo payload gave no report");
    return report;
}

describe("backend payload contract", () => {
    it.each(payloads)("normalizes the %s payload and returns it as the report", (_name, details) => {
        const event = normalizeExecutionEvent({ type: "MacrosExpanded", details });
        expect(event.type).toBe("MacrosExpanded");
        expect(macroReportFromEvents([event])).toEqual(details);
    });

    it("carries the facts the views rely on", () => {
        const report = demoReport();
        expect(report.ok).toBe(true);
        expect(report.hasMacros).toBe(true);
        expect(report.expansions.map((e) => [e.macro, e.parent])).toEqual([
            ["DOBRA", null], ["SOMA", 1], ["MAXIMO", null], ["ESCALA", null], ["MULTK", null],
        ]);
        expect(report.names.find((n) => n.name === "MULTK")?.line).toBe(0);
        expect((fig412Payload as MacroReport).trace.steps).toHaveLength(20);
    });
});

describe("bands on the demo payload", () => {
    it("has one source band and one output band per top-level expansion", () => {
        const report = demoReport();
        const topLevel = report.expansions.filter((e) => e.parent === null);
        const bands = macroBands(report);
        expect(topLevel).toHaveLength(4);
        expect(bands.source).toHaveLength(topLevel.length);
        expect(bands.output).toHaveLength(topLevel.length);
        expect(bands.source.map((b) => [b.from, b.to])).toEqual(topLevel.map((e) => [e.callLine, e.callLine]));
        expect(bands.output.map((b) => [b.from, b.to])).toEqual(topLevel.map((e) => [e.output.from, e.output.to]));
    });

    it("maps every output line of SOMA's expansion to DOBRA's call line", () => {
        const report = demoReport();
        const dobra = report.expansions.find((e) => e.macro === "DOBRA")!;
        const soma = report.expansions.find((e) => e.macro === "SOMA")!;
        for (let line = soma.output.from; line <= soma.output.to; line++) {
            expect(sourceLineForOutput(report, line)).toBe(dobra.callLine);
        }
    });
});
