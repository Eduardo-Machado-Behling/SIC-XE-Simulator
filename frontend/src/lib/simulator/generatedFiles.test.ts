import { describe, expect, it } from "vitest";
import {
    MACRO_OUTPUT_FILE,
    applyMacroReport,
    canCreate,
    canMove,
    canRename,
    entryPointFile,
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
