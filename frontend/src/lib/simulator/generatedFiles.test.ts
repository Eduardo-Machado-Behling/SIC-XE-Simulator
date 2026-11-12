import { describe, expect, it } from "vitest";
import {
    MACRO_OUTPUT_FILE,
    applyMacroReport,
    canCreate,
    canMove,
    canRename,
    entryPointFile,
    fileToOpen,
    fileToRun,
    isGeneratedFile,
} from "./generatedFiles";
import type { MacroReport } from "./ExecutionEvent";

function report(hasMacros: boolean, text: string): MacroReport {
    return {
        file: "MASMAPRG.ASM", ok: true, hasMacros, text, diagnostics: [], names: [],
        definitions: [], expansions: [], lineMap: [], trace: { truncated: false, steps: [] },
    };
}

describe("isGeneratedFile", () => {
    it("matches only the exact root name", () => {
        expect(isGeneratedFile(MACRO_OUTPUT_FILE)).toBe(true);
        expect(isGeneratedFile("masmaprg.asm")).toBe(false);
        expect(isGeneratedFile("src/MASMAPRG.ASM")).toBe(false);
        expect(isGeneratedFile("main.asm")).toBe(false);
    });
});

describe("entryPointFile", () => {
    it("never returns the generated file", () => {
        expect(entryPointFile({ "MASMAPRG.ASM": "P START 0", "main.asm": "P START 0" })).toBe("main.asm");
        expect(entryPointFile({ "MASMAPRG.ASM": "P START 0" }, "sicxe")).toBe("");
        expect(entryPointFile({ "MASMAPRG.ASM": "P START 0" })).toBe("");
    });

    it("prefers a file with START, then END, then main, then the first source", () => {
        expect(entryPointFile({ "a.asm": "LDA 1", "b.asm": "P START 0" })).toBe("b.asm");
        expect(entryPointFile({ "a.asm": "LDA 1", "b.asm": " END P" })).toBe("b.asm");
        expect(entryPointFile({ "a.asm": "LDA 1", "main.asm": "LDA 1" })).toBe("main.asm");
        expect(entryPointFile({ "z.asm": "LDA 1", "a.asm": "LDA 1" })).toBe("a.asm");
    });

    it("detects directives ignoring comments, dot lines and case", () => {
        expect(entryPointFile({ "a.asm": "; P START 0", "b.asm": "p start 0\r\nLDA 1" })).toBe("b.asm");
        expect(entryPointFile({ "a.asm": ". START", "b.asm": "x" }, undefined)).toBe("a.asm");
    });

    it("falls back to directive-bearing non-asm files, then to SIC/XE emptiness", () => {
        expect(entryPointFile({ "notes.txt": "hello", "prog.txt": "P START 0" })).toBe("prog.txt");
        expect(entryPointFile({ "notes.txt": "hello" }, "SIC/XE")).toBe("");
        expect(entryPointFile({ "notes.txt": "hello" }, "other")).toBe("notes.txt");
        expect(entryPointFile({}, "other")).toBe("");
    });
});

describe("fileToRun", () => {
    // Both have a START, and macro.asm sorts first: it is the entry point.
    const both = { "macro.asm": "MAC START 0", "main.asm": "PROG START 0" };
    const run = { ...both, "MASMAPRG.ASM": "MAC START 0" };

    it("assembles the open file when it is a source", () => {
        expect(fileToRun(both, "macro.asm", null, "SIC/XE")).toBe("macro.asm");
        expect(fileToRun(both, "main.asm", null, "SIC/XE")).toBe("main.asm");
        expect(fileToRun(run, "main.asm", "macro.asm", "SIC/XE")).toBe("main.asm");
    });

    it("assembles the last Run's source while MASMAPRG.ASM is open, else the entry point", () => {
        expect(fileToRun(run, "MASMAPRG.ASM", "main.asm", "SIC/XE")).toBe("main.asm");
        expect(fileToRun(run, "MASMAPRG.ASM", null, "SIC/XE")).toBe(entryPointFile(run, "SIC/XE"));
        expect(fileToRun(run, "MASMAPRG.ASM", null, "SIC/XE")).toBe("macro.asm");
        // A last source that was deleted or renamed since.
        expect(fileToRun(run, "MASMAPRG.ASM", "gone.asm", "SIC/XE")).toBe("macro.asm");
    });

    it("falls back the same way when the open file is not a source", () => {
        const withNotes = { ...both, "notes.txt": "PROG START 0" };
        expect(fileToRun(withNotes, "notes.txt", "main.asm", "SIC/XE")).toBe("main.asm");
        expect(fileToRun(withNotes, "notes.txt", null, "SIC/XE")).toBe("macro.asm");
        expect(fileToRun(both, "", null, "SIC/XE")).toBe("macro.asm");
        expect(fileToRun(both, "missing.asm", null, "SIC/XE")).toBe("macro.asm");
    });

    it("leaves a single file and other architectures as entryPointFile has them", () => {
        expect(fileToRun({ "main.asm": "PROG START 0" }, "main.asm", null, "SIC/XE")).toBe("main.asm");
        expect(fileToRun({ "notes.txt": "hello" }, "notes.txt", null, "other")).toBe("notes.txt");
        expect(fileToRun({ "notes.txt": "hello" }, "notes.txt", null, "SIC/XE")).toBe("");
        expect(fileToRun({ "a.asm": "LDA 1", "b.txt": "x" }, "b.txt", null, "other")).toBe("a.asm");
    });
});

describe("fileToOpen", () => {
    it("opens the root main source", () => {
        expect(fileToOpen({ "macro.asm": "MAC START 0", "main.asm": "PROG START 0" }, "SIC/XE")).toBe("main.asm");
        expect(fileToOpen({ "a.asm": "A START 0", "MAIN.S": "LDA 1" }, "SIC/XE")).toBe("MAIN.S");
    });

    it("opens the entry point when there is no root main source", () => {
        expect(fileToOpen({ "macro.asm": "MAC START 0", "src/main.asm": "PROG START 0" }, "SIC/XE")).toBe("macro.asm");
        expect(fileToOpen({ "main.txt": "PROG START 0", "b.asm": "LDA 1" }, "SIC/XE")).toBe("b.asm");
        expect(fileToOpen({ "MASMAPRG.ASM": "PROG START 0" }, "SIC/XE")).toBe("");
        expect(fileToOpen({}, "SIC/XE")).toBe("");
    });

    it("leaves a single file as it was", () => {
        expect(fileToOpen({ "main.asm": "PROG START 0" }, "SIC/XE")).toBe("main.asm");
        expect(fileToOpen({ "prog.asm": "PROG START 0" }, "SIC/XE")).toBe("prog.asm");
        expect(fileToOpen({ "notes.txt": "hello" }, "other")).toBe("notes.txt");
    });
});

describe("applyMacroReport", () => {
    const files = { "main.asm": "A" };

    it("upserts the generated file when the report has macros", () => {
        expect(applyMacroReport(files, report(true, "OUT"))).toEqual({ "main.asm": "A", "MASMAPRG.ASM": "OUT" });
        expect(applyMacroReport({ ...files, "MASMAPRG.ASM": "OLD" }, report(true, "NEW")))
            .toEqual({ "main.asm": "A", "MASMAPRG.ASM": "NEW" });
    });

    it("removes the generated file when the report has no macros", () => {
        expect(applyMacroReport({ ...files, "MASMAPRG.ASM": "OLD" }, report(false, "A"))).toEqual(files);
        expect(applyMacroReport(files, report(false, "A"))).toEqual(files);
    });

    it("leaves files unchanged for a null report", () => {
        const withGenerated = { ...files, "MASMAPRG.ASM": "OLD" };
        expect(applyMacroReport(withGenerated, null)).toEqual(withGenerated);
    });

    it("does not mutate its input", () => {
        const input = { ...files };
        applyMacroReport(input, report(true, "OUT"));
        expect(input).toEqual(files);
    });
});

describe("path guards", () => {
    it("blocks rename and move of the generated file only", () => {
        expect(canRename("MASMAPRG.ASM")).toBe(false);
        expect(canMove("MASMAPRG.ASM")).toBe(false);
        expect(canRename("main.asm")).toBe(true);
        expect(canMove("main.asm")).toBe(true);
    });

    it("blocks creating any case variant of the name at the root", () => {
        expect(canCreate("MASMAPRG.ASM")).toBe(false);
        expect(canCreate("masmaprg.asm")).toBe(false);
        expect(canCreate("src/masmaprg.asm")).toBe(true);
        expect(canCreate("main.asm")).toBe(true);
    });
});
