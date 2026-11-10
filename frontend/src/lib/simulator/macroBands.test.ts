import { describe, expect, it } from "vitest";

import {
    bandAt,
    bandDecorations,
    clearMacroViewOnEdit,
    editorDecorations,
    expansionReveal,
    macroBands,
    macroViewForRun,
    NO_MACRO_VIEW,
    secondaryLineDecoration,
    sourceLineForOutput,
} from "@/lib/simulator/macroBands";
import { MACRO_OUTPUT_FILE } from "@/lib/simulator/generatedFiles";
import { macroReportFixture as report } from "@/lib/simulator/macroFixtures";

// The fixture: DOBRA called on source line 13 (output 3-7, with SOMA nested at
// output 4-7) and SOMA called on source line 14 (output 8-11).

describe("macroReportFixture", () => {
    it("is one consistent report", () => {
        expect(report.lineMap).toHaveLength(report.text.split("\n").length);
        report.lineMap.forEach((row, index) => expect(row.output).toBe(index + 1));

        for (const expansion of report.expansions) {
            expect(report.definitions[expansion.definition].name).toBe(expansion.macro);
            let outermost = expansion;
            while (outermost.parent !== null) {
                outermost = report.expansions.find((item) => item.serial === outermost.parent)!;
            }
            const rows = report.lineMap.slice(expansion.output.from - 1, expansion.output.to);
            expect(rows[0]).toMatchObject({ kind: "call", serial: expansion.serial });
            for (const row of rows) {
                expect(row.kind).not.toBe("verbatim");
                expect(row.source).toBe(outermost.callLine);
            }
        }
    });
});

describe("macroBands", () => {
    it("skips an expansion whose output range is inverted, in both lists", () => {
        // A limit error on the call's comment line leaves from > to.
        const broken = {
            ...report,
            expansions: [
                ...report.expansions,
                { ...report.expansions[0], serial: 9, parent: null, callLine: 20, output: { from: 12, to: 11 } },
                { ...report.expansions[0], serial: 10, parent: null, callLine: 21, output: { from: 12, to: 12 } },
            ],
        };
        const bands = macroBands(broken);
        expect(bands.source).toHaveLength(3);
        expect(bands.source[2]).toEqual({ from: 21, to: 21, colorIndex: 2 });
        expect(bands.output[2]).toEqual({ from: 12, to: 12, colorIndex: 2 });
        expect(expansionReveal(broken, 10)?.bandIndex).toBe(2);
        expect(expansionReveal(broken, 9)?.bandIndex).toBeNull();
    });

    it("colours each top-level call line and its output block alike", () => {
        expect(macroBands(report)).toEqual({
            source: [{ from: 13, to: 13, colorIndex: 0 }, { from: 14, to: 14, colorIndex: 1 }],
            output: [{ from: 3, to: 7, colorIndex: 0 }, { from: 8, to: 11, colorIndex: 1 }],
        });
    });

    it("gives a nested call no band of its own", () => {
        const nested = report.expansions.find((expansion) => expansion.parent !== null)!;
        const { output } = macroBands(report);

        expect(output.some((band) => band.from === nested.output.from)).toBe(false);
    });

    it("cycles through six colours", () => {
        const top = report.expansions[0];
        const expansions = Array.from({ length: 7 }, (_, index) => ({ ...top, serial: index + 1, callLine: index + 1 }));

        expect(macroBands({ ...report, expansions }).source.map((band) => band.colorIndex))
            .toEqual([0, 1, 2, 3, 4, 5, 0]);
    });
});

describe("sourceLineForOutput", () => {
    it("maps an expanded line, even a nested one, to the outermost call", () => {
        expect(sourceLineForOutput(report, 5)).toBe(13);
        expect(sourceLineForOutput(report, 10)).toBe(14);
    });

    it("maps a verbatim line to its own source line", () => {
        expect(sourceLineForOutput(report, 1)).toBe(1);
        expect(sourceLineForOutput(report, 12)).toBe(15);
    });

    it("is null outside the map", () => {
        expect(sourceLineForOutput(report, 0)).toBeNull();
        expect(sourceLineForOutput(report, 17)).toBeNull();
    });
});

describe("bandAt", () => {
    it("finds the band that covers a line", () => {
        const { output } = macroBands(report);

        expect(bandAt(output, 3)).toBe(0);
        expect(bandAt(output, 7)).toBe(0);
        expect(bandAt(output, 9)).toBe(1);
        expect(bandAt(output, 2)).toBe(-1);
    });
});

describe("decorations", () => {
    it("paint a band as whole lines with its colour class and a gutter stripe", () => {
        expect(bandDecorations([{ from: 3, to: 7, colorIndex: 4 }])).toEqual([{
            range: { startLineNumber: 3, startColumn: 1, endLineNumber: 7, endColumn: 1 },
            options: {
                isWholeLine: true,
                className: "macro-band-4",
                linesDecorationsClassName: "macro-band-4 macro-band-stripe",
            },
        }]);
    });

    it("paint the secondary line as a whole line", () => {
        expect(secondaryLineDecoration(13)).toEqual({
            range: { startLineNumber: 13, startColumn: 1, endLineNumber: 13, endColumn: 1 },
            options: { isWholeLine: true, className: "sicxe-secondary-line" },
        });
    });
});

describe("editorDecorations", () => {
    const view = macroViewForRun(report, "main.asm");
    const stepping = { report, view, executingLine: 5, executionSourceFile: "main.asm" };

    it("puts the executing line on MASMAPRG.ASM and its call line on the source when the Run had macros", () => {
        expect(editorDecorations(MACRO_OUTPUT_FILE, stepping)).toEqual({
            bands: view.bands!.output, executingLine: 5, secondaryLine: null,
        });
        expect(editorDecorations("main.asm", stepping)).toEqual({
            bands: view.bands!.source, executingLine: null, secondaryLine: 13,
        });
        expect(editorDecorations("other.asm", stepping)).toEqual({
            bands: [], executingLine: null, secondaryLine: null,
        });
    });

    it("has no secondary line before the first instruction is fetched", () => {
        expect(editorDecorations("main.asm", { ...stepping, executingLine: null }).secondaryLine).toBeNull();
    });

    it("keeps today's behaviour when the Run had no macros", () => {
        const plain = { ...report, hasMacros: false, expansions: [] };
        const context = {
            report: plain, view: macroViewForRun(plain, "main.asm"), executingLine: 7, executionSourceFile: "main.asm",
        };

        expect(context.view).toEqual({ sourceFile: "main.asm", bands: null });
        expect(editorDecorations("main.asm", context)).toEqual({ bands: [], executingLine: 7, secondaryLine: null });
        expect(editorDecorations("other.asm", context).executingLine).toBeNull();
        expect(editorDecorations("main.asm", { ...context, report: null, view: NO_MACRO_VIEW }).executingLine).toBe(7);
    });
});

describe("clearMacroViewOnEdit (Review Focus 5)", () => {
    const view = macroViewForRun(report, "main.asm");

    it("drops the bands and the secondary line as soon as the Run's entry file is edited", () => {
        const edited = clearMacroViewOnEdit(view, "main.asm");
        const context = { report, view: edited, executingLine: 5, executionSourceFile: "main.asm" };

        expect(edited).toEqual({ sourceFile: "main.asm", bands: null });
        expect(editorDecorations("main.asm", context)).toEqual({ bands: [], executingLine: null, secondaryLine: null });
        expect(editorDecorations(MACRO_OUTPUT_FILE, context).bands).toEqual([]);
    });

    it("leaves them alone when another file is edited", () => {
        expect(clearMacroViewOnEdit(view, "other.asm")).toBe(view);
    });

    it("returns the same state when there is nothing left to clear", () => {
        const edited = clearMacroViewOnEdit(view, "main.asm");

        expect(clearMacroViewOnEdit(edited, "main.asm")).toBe(edited);
        expect(clearMacroViewOnEdit(NO_MACRO_VIEW, "main.asm")).toBe(NO_MACRO_VIEW);
    });
});

describe("expansionReveal", () => {
    it("reveals a top-level expansion through its band", () => {
        expect(expansionReveal(report, 3)).toEqual({ outputLine: 8, sourceLine: 14, bandIndex: 1 });
    });

    it("reveals a nested expansion at its own output and its outermost call line", () => {
        expect(expansionReveal(report, 2)).toEqual({ outputLine: 4, sourceLine: 13, bandIndex: null });
    });

    it("knows no expansion that is not in the report", () => {
        expect(expansionReveal(report, 99)).toBeNull();
    });
});
