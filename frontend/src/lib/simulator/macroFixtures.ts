import type { MacroReport } from "@/lib/simulator/ExecutionEvent";

// Raw JSON of a MacrosExpanded event, as the backend emits it. Shared by the
// frontend tests; the normalizer must turn it into `macroReportFixture`.
export const rawMacroReportFixture = {
    file: "MASMAPRG.ASM",
    ok: true,
    hasMacros: true,
    text: "INICIO  START   0\n        LDA     #1\n        END\n",
    diagnostics: [
        { severity: "warning", line: 3, column: 9, length: 5, message: "Unused macro" },
    ],
    names: [{ name: "SOMA", definition: 0, line: 3 }],
    definitions: [{
        index: 0,
        name: "SOMA",
        prototype: "L SOMA X,Y,Z",
        labelFormal: "L",
        formals: [{ name: "X", default: null }],
        active: true,
        origin: { kind: "source", line: 2 },
        body: [{ text: "#0 LDA #1", line: 4 }],
    }],
    expansions: [{
        serial: 1,
        macro: "DOBRA",
        definition: 1,
        parent: null,
        depth: 1,
        callLine: 21,
        callText: "INICIO  DOBRA N",
        actuals: [
            { index: 0, formal: "L", value: "INICIO" },
            { index: 1, formal: "V", value: "N" },
        ],
        output: { from: 2, to: 6 },
    }],
    lineMap: [{ output: 1, source: 20, kind: "verbatim", serial: null }],
    trace: {
        truncated: false,
        steps: [{
            step: 1,
            read: { from: "source", line: 1 },
            d: 0,
            e: false,
            depth: 0,
            text: "        MCDEFN",
            action: "define-start",
            target: null,
        }],
    },
};

export const macroReportFixture = rawMacroReportFixture as unknown as MacroReport;
