import { describe, expect, it } from "vitest";

import type { ExecutionEvent, LinkReport } from "@/lib/simulator/ExecutionEvent";
import { generatedTabs, macroReportsBySource, objectFileName } from "@/lib/simulator/generatedOutputs";
import { macroReportFixture } from "@/lib/simulator/macroFixtures";

const link: LinkReport = {
    loadAddress: 0x1000,
    estab: [],
    objects: [
        { source: "main.asm", text: "H PROG   000000 000008\n" },
        { source: "sub.asm", text: "H SUBB   000000 000003\n" },
    ],
    out: { name: "PROG", text: "H PROG   000000 00000B\n", bands: [] },
    trace: [],
};
const withMacros = { ...macroReportFixture, hasMacros: true, text: "MAIN EXPANDED" };

describe("generatedTabs", () => {
    it("shows the open file's macro output, its object program and the linked program", () => {
        expect(generatedTabs("main.asm", { "main.asm": withMacros }, link).map((tab) => tab.label))
            .toEqual(["MASMAPRG.ASM", "main.obj", "PROG.out"]);
        expect(generatedTabs("main.asm", { "main.asm": withMacros }, link)[0].text).toBe("MAIN EXPANDED");
    });

    it("follows the open file, and shows the linked program from every file", () => {
        const tabs = generatedTabs("sub.asm", { "main.asm": withMacros }, link);
        expect(tabs.map((tab) => tab.label)).toEqual(["sub.obj", "PROG.out"]);
        expect(tabs[0].text).toBe("H SUBB   000000 000003\n");
        expect(generatedTabs("notes.txt", {}, link).map((tab) => tab.label)).toEqual(["PROG.out"]);
    });

    it("has no macro tab for a file without macros, and nothing without a Run", () => {
        expect(generatedTabs("main.asm", { "main.asm": { ...withMacros, hasMacros: false } }, link).map((tab) => tab.id))
            .toEqual(["obj", "out"]);
        expect(generatedTabs("main.asm", {}, null)).toEqual([]);
    });
});

describe("objectFileName", () => {
    it("is the stem with .obj, and keeps the folder when two sources share a stem", () => {
        expect(objectFileName("linker/prog.asm", ["linker/prog.asm", "linker/dados.asm"])).toBe("prog.obj");
        expect(objectFileName("a/x.asm", ["a/x.asm", "b/x.asm"])).toBe("a/x.obj");
        expect(objectFileName("b/x.asm", ["a/x.asm", "b/x.asm"])).toBe("b/x.obj");
    });
});

describe("macroReportsBySource", () => {
    it("keeps one report per file, and a report without a source for the Run's file", () => {
        const events: ExecutionEvent[] = [
            { type: "MacrosExpanded", details: { ...macroReportFixture, source: "main.asm", text: "MAIN" } },
            { type: "MacrosExpanded", details: { ...macroReportFixture, source: "sub.asm", text: "SUB" } },
        ];
        const reports = macroReportsBySource(events, "main.asm");
        expect(Object.keys(reports).sort()).toEqual(["main.asm", "sub.asm"]);
        expect(reports["sub.asm"].text).toBe("SUB");
        const legacy = macroReportsBySource([{ type: "MacrosExpanded", details: { ...macroReportFixture, text: "OLD" } }], "main.asm");
        expect(legacy["main.asm"].text).toBe("OLD");
    });
});
