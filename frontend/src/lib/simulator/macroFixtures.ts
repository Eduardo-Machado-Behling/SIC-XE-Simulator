import type { MacroReport } from "@/lib/simulator/ExecutionEvent";

// Raw JSON of a MacrosExpanded event, as the backend emits it. Shared by the
// frontend tests; the normalizer must turn it into `macroReportFixture`.
//
// It is the report of this source (no final newline), with two top-level
// calls, DOBRA on line 13 and SOMA on line 14, and SOMA called again from
// inside DOBRA:
//
//    1  . Two top-level calls, the first one with a nested call
//    2          MCDEFN
//    3  L       SOMA X,Y,Z
//    4  L       LDA X
//    5          ADD Y
//    6          STA Z
//    7          MCEND
//    8          MCDEFN
//    9  L       DOBRA V
//   10  L       SOMA V,V,V
//   11          MCEND
//   12  PROG    START 0
//   13  INICIO  DOBRA N
//   14          SOMA N,M,TOTAL
//   15          HALT
//   16  N       WORD 5
//   17  M       WORD 7
//   18  TOTAL   RESW 1
//   19          END INICIO
//   20          MCDEFN
//   21  L       TRIPLA V
//   22  L       ADD V
//   23          MCEND
//   24          MCDEFN
//   25  L       TRIPLA V
//   26  L       STA V
//   27          MCEND
//
// TRIPLA is defined twice (lines 20 and 24), so definition 2 is the redefined,
// inactive one and the name table points at definition 3. Nothing calls it, so
// the trace stops at END and has no steps for these definition lines.
export const rawMacroReportFixture = {
    file: "MASMAPRG.ASM",
    ok: true,
    hasMacros: true,
    text: [
        ". Two top-level calls, the first one with a nested call",
        "PROG    START 0",
        ".INICIO  DOBRA N",
        ".INICIO SOMA N,N,N",
        "INICIO LDA N",
        "ADD N",
        "STA N",
        ".        SOMA N,M,TOTAL",
        " LDA N",
        "ADD M",
        "STA TOTAL",
        "        HALT",
        "N       WORD 5",
        "M       WORD 7",
        "TOTAL   RESW 1",
        "        END INICIO",
    ].join("\n"),
    diagnostics: [],
    names: [
        { name: "SOMA", definition: 0, line: 3 },
        { name: "DOBRA", definition: 1, line: 9 },
        { name: "TRIPLA", definition: 3, line: 25 },
    ],
    definitions: [
        {
            index: 0,
            name: "SOMA",
            prototype: "L SOMA X,Y,Z",
            labelFormal: "L",
            formals: [
                { name: "X", default: null },
                { name: "Y", default: null },
                { name: "Z", default: null },
            ],
            active: true,
            origin: { kind: "source", line: 2 },
            body: [
                { text: "L SOMA X,Y,Z", line: 3 },
                { text: "#0 LDA #1", line: 4 },
                { text: "ADD #2", line: 5 },
                { text: "STA #3", line: 6 },
                { text: "MCEND", line: 7 },
            ],
        },
        {
            index: 1,
            name: "DOBRA",
            prototype: "L DOBRA V",
            labelFormal: "L",
            formals: [{ name: "V", default: null }],
            active: true,
            origin: { kind: "source", line: 8 },
            body: [
                { text: "L DOBRA V", line: 9 },
                { text: "#0 SOMA #1,#1,#1", line: 10 },
                { text: "MCEND", line: 11 },
            ],
        },
        {
            index: 2,
            name: "TRIPLA",
            prototype: "L TRIPLA V",
            labelFormal: "L",
            formals: [{ name: "V", default: null }],
            active: false,
            origin: { kind: "source", line: 20 },
            body: [
                { text: "L TRIPLA V", line: 21 },
                { text: "#0 ADD #1", line: 22 },
                { text: "MCEND", line: 23 },
            ],
        },
        {
            index: 3,
            name: "TRIPLA",
            prototype: "L TRIPLA V",
            labelFormal: "L",
            formals: [{ name: "V", default: null }],
            active: true,
            origin: { kind: "source", line: 24 },
            body: [
                { text: "L TRIPLA V", line: 25 },
                { text: "#0 STA #1", line: 26 },
                { text: "MCEND", line: 27 },
            ],
        },
    ],
    expansions: [
        {
            serial: 1,
            macro: "DOBRA",
            definition: 1,
            parent: null,
            depth: 1,
            callLine: 13,
            callText: "INICIO  DOBRA N",
            actuals: [
                { index: 0, formal: "L", value: "INICIO" },
                { index: 1, formal: "V", value: "N" },
            ],
            output: { from: 3, to: 7 },
        },
        {
            serial: 2,
            macro: "SOMA",
            definition: 0,
            parent: 1,
            depth: 2,
            callLine: 13,
            callText: "INICIO SOMA N,N,N",
            actuals: [
                { index: 0, formal: "L", value: "INICIO" },
                { index: 1, formal: "X", value: "N" },
                { index: 2, formal: "Y", value: "N" },
                { index: 3, formal: "Z", value: "N" },
            ],
            output: { from: 4, to: 7 },
        },
        {
            serial: 3,
            macro: "SOMA",
            definition: 0,
            parent: null,
            depth: 1,
            callLine: 14,
            callText: "        SOMA N,M,TOTAL",
            actuals: [
                { index: 0, formal: "L", value: "" },
                { index: 1, formal: "X", value: "N" },
                { index: 2, formal: "Y", value: "M" },
                { index: 3, formal: "Z", value: "TOTAL" },
            ],
            output: { from: 8, to: 11 },
        },
    ],
    lineMap: [
        { output: 1, source: 1, kind: "verbatim", serial: null },
        { output: 2, source: 12, kind: "verbatim", serial: null },
        { output: 3, source: 13, kind: "call", serial: 1 },
        { output: 4, source: 13, kind: "call", serial: 2 },
        { output: 5, source: 13, kind: "expanded", serial: 2 },
        { output: 6, source: 13, kind: "expanded", serial: 2 },
        { output: 7, source: 13, kind: "expanded", serial: 2 },
        { output: 8, source: 14, kind: "call", serial: 3 },
        { output: 9, source: 14, kind: "expanded", serial: 3 },
        { output: 10, source: 14, kind: "expanded", serial: 3 },
        { output: 11, source: 14, kind: "expanded", serial: 3 },
        { output: 12, source: 15, kind: "verbatim", serial: null },
        { output: 13, source: 16, kind: "verbatim", serial: null },
        { output: 14, source: 17, kind: "verbatim", serial: null },
        { output: 15, source: 18, kind: "verbatim", serial: null },
        { output: 16, source: 19, kind: "verbatim", serial: null },
    ],
    trace: {
        truncated: false,
        steps: [
            { step: 1, read: { from: "source", line: 1 }, d: 0, e: false, depth: 0, text: ". Two top-level calls, the first one with a nested call", action: "copy", target: { output: 1 } },
            { step: 2, read: { from: "source", line: 2 }, d: 0, e: false, depth: 0, text: "        MCDEFN", action: "define-start", target: null },
            { step: 3, read: { from: "source", line: 3 }, d: 1, e: false, depth: 0, text: "L       SOMA X,Y,Z", action: "prototype", target: { definition: 0, bodyLine: 1 } },
            { step: 4, read: { from: "source", line: 4 }, d: 1, e: false, depth: 0, text: "L       LDA X", action: "store", target: { definition: 0, bodyLine: 2 } },
            { step: 5, read: { from: "source", line: 5 }, d: 1, e: false, depth: 0, text: "        ADD Y", action: "store", target: { definition: 0, bodyLine: 3 } },
            { step: 6, read: { from: "source", line: 6 }, d: 1, e: false, depth: 0, text: "        STA Z", action: "store", target: { definition: 0, bodyLine: 4 } },
            { step: 7, read: { from: "source", line: 7 }, d: 1, e: false, depth: 0, text: "        MCEND", action: "define-end", target: { definition: 0, bodyLine: 5 } },
            { step: 8, read: { from: "source", line: 8 }, d: 0, e: false, depth: 0, text: "        MCDEFN", action: "define-start", target: null },
            { step: 9, read: { from: "source", line: 9 }, d: 1, e: false, depth: 0, text: "L       DOBRA V", action: "prototype", target: { definition: 1, bodyLine: 1 } },
            { step: 10, read: { from: "source", line: 10 }, d: 1, e: false, depth: 0, text: "L       SOMA V,V,V", action: "store", target: { definition: 1, bodyLine: 2 } },
            { step: 11, read: { from: "source", line: 11 }, d: 1, e: false, depth: 0, text: "        MCEND", action: "define-end", target: { definition: 1, bodyLine: 3 } },
            { step: 12, read: { from: "source", line: 12 }, d: 0, e: false, depth: 0, text: "PROG    START 0", action: "copy", target: { output: 2 } },
            { step: 13, read: { from: "source", line: 13 }, d: 0, e: false, depth: 0, text: "INICIO  DOBRA N", action: "call", target: { serial: 1 } },
            { step: 14, read: { from: "expansion", serial: 1, bodyLine: 1 }, d: 0, e: true, depth: 1, text: "L DOBRA V", action: "read-prototype", target: null },
            { step: 15, read: { from: "expansion", serial: 1, bodyLine: 2 }, d: 0, e: true, depth: 1, text: "INICIO SOMA N,N,N", action: "call", target: { serial: 2 } },
            { step: 16, read: { from: "expansion", serial: 2, bodyLine: 1 }, d: 0, e: true, depth: 2, text: "L SOMA X,Y,Z", action: "read-prototype", target: null },
            { step: 17, read: { from: "expansion", serial: 2, bodyLine: 2 }, d: 0, e: true, depth: 2, text: "INICIO LDA N", action: "copy", target: { output: 5 } },
            { step: 18, read: { from: "expansion", serial: 2, bodyLine: 3 }, d: 0, e: true, depth: 2, text: "ADD N", action: "copy", target: { output: 6 } },
            { step: 19, read: { from: "expansion", serial: 2, bodyLine: 4 }, d: 0, e: true, depth: 2, text: "STA N", action: "copy", target: { output: 7 } },
            { step: 20, read: { from: "expansion", serial: 2, bodyLine: 5 }, d: 0, e: true, depth: 2, text: "MCEND", action: "expansion-end", target: null },
            { step: 21, read: { from: "expansion", serial: 1, bodyLine: 3 }, d: 0, e: true, depth: 1, text: "MCEND", action: "expansion-end", target: null },
            { step: 22, read: { from: "source", line: 14 }, d: 0, e: false, depth: 0, text: "        SOMA N,M,TOTAL", action: "call", target: { serial: 3 } },
            { step: 23, read: { from: "expansion", serial: 3, bodyLine: 1 }, d: 0, e: true, depth: 1, text: "L SOMA X,Y,Z", action: "read-prototype", target: null },
            { step: 24, read: { from: "expansion", serial: 3, bodyLine: 2 }, d: 0, e: true, depth: 1, text: " LDA N", action: "copy", target: { output: 9 } },
            { step: 25, read: { from: "expansion", serial: 3, bodyLine: 3 }, d: 0, e: true, depth: 1, text: "ADD M", action: "copy", target: { output: 10 } },
            { step: 26, read: { from: "expansion", serial: 3, bodyLine: 4 }, d: 0, e: true, depth: 1, text: "STA TOTAL", action: "copy", target: { output: 11 } },
            { step: 27, read: { from: "expansion", serial: 3, bodyLine: 5 }, d: 0, e: true, depth: 1, text: "MCEND", action: "expansion-end", target: null },
            { step: 28, read: { from: "source", line: 15 }, d: 0, e: false, depth: 0, text: "        HALT", action: "copy", target: { output: 12 } },
            { step: 29, read: { from: "source", line: 16 }, d: 0, e: false, depth: 0, text: "N       WORD 5", action: "copy", target: { output: 13 } },
            { step: 30, read: { from: "source", line: 17 }, d: 0, e: false, depth: 0, text: "M       WORD 7", action: "copy", target: { output: 14 } },
            { step: 31, read: { from: "source", line: 18 }, d: 0, e: false, depth: 0, text: "TOTAL   RESW 1", action: "copy", target: { output: 15 } },
            { step: 32, read: { from: "source", line: 19 }, d: 0, e: false, depth: 0, text: "        END INICIO", action: "copy", target: { output: 16 } },
        ],
    },
};

export const macroReportFixture = rawMacroReportFixture as unknown as MacroReport;
