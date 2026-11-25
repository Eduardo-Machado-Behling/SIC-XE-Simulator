import { describe, expect, it } from "vitest";

import type { LinkReport } from "@/lib/simulator/ExecutionEvent";
import { linkBands, sectionStartLine } from "@/lib/simulator/linkBands";
import { bandDecorations } from "@/lib/simulator/macroBands";

const report: LinkReport = {
    loadAddress: 0x1000,
    estab: [
        { section: "PROG", symbol: "", address: 0, length: 0x23, file: "main.asm" },
        { section: "PROG", symbol: "N", address: 0x1a, length: 0, file: "main.asm" },
        { section: "DOBRA", symbol: "", address: 0x23, length: 6, file: "dobra.asm" },
    ],
    objects: [],
    out: {
        name: "PROG",
        text: "",
        bands: [
            { firstLine: 2, lastLine: 5, label: "main.asm · PROG" },
            { firstLine: 6, lastLine: 7, label: "dobra.asm · DOBRA" },
        ],
    },
    trace: [],
};

// Echoes the key and its values, so the tests pin what the hover says, not its wording.
const t = (key: string, vars?: Record<string, string | number>) => `${key} ${JSON.stringify(vars)}`;

describe("linkBands", () => {
    it("gives each section of the linked program its own band, colour, origin label and origin", () => {
        expect(linkBands(report, t)).toMatchObject([
            { from: 2, to: 5, colorIndex: 0, label: "main.asm · PROG", file: "main.asm", section: "PROG" },
            { from: 6, to: 7, colorIndex: 1, label: "dobra.asm · DOBRA", file: "dobra.asm", section: "DOBRA" },
        ]);
    });

    it("hovers with the file, the section and where the loader put it", () => {
        const [first, second] = linkBands(report, t);
        expect(first.hover).toBe(`link.bandHover ${JSON.stringify({ file: "main.asm", section: "PROG", start: "001000", end: "001022", length: 35 })}`);
        expect(second.hover).toBe(`link.bandHover ${JSON.stringify({ file: "dobra.asm", section: "DOBRA", start: "001023", end: "001028", length: 6 })}`);
    });

    it("reuses the macro palette, which has six colours", () => {
        const bands = Array.from({ length: 7 }, (_, i) => ({ firstLine: i + 1, lastLine: i + 1, label: `f.asm · S${i}` }));
        const many = { ...report, out: { ...report.out, bands } };
        expect(linkBands(many, t).map((band) => band.colorIndex)).toEqual([0, 1, 2, 3, 4, 5, 0]);
    });
});

describe("sectionStartLine", () => {
    const source = ". a comment\nDADOS   START 0\nK       WORD 3\n\nTABELA  csect\nPROG    ENTRY 0\n";

    it("finds the line a section starts on: START, ENTRY or CSECT", () => {
        expect(sectionStartLine(source, "DADOS")).toBe(2);
        expect(sectionStartLine(source, "TABELA")).toBe(5);
        expect(sectionStartLine(source, "PROG")).toBe(6);
    });

    it("finds no line for a name that only labels other statements", () => {
        expect(sectionStartLine(source, "K")).toBeNull();
    });
});

describe("bandDecorations with a label", () => {
    it("writes the label after the band's first line", () => {
        const decorations = bandDecorations([{ from: 6, to: 7, colorIndex: 1, label: "dobra.asm · DOBRA" }]);
        expect(decorations).toHaveLength(2);
        expect(decorations[1]).toMatchObject({
            range: { startLineNumber: 6, endLineNumber: 6 },
            options: { after: { content: "  ▌ dobra.asm · DOBRA", inlineClassName: "band-label" } },
        });
    });

    it("shows the band's hover over every line of it", () => {
        const [band] = bandDecorations([{ from: 6, to: 7, colorIndex: 1, hover: "**dobra.asm**" }]);
        expect(band.options.hoverMessage).toEqual({ value: "**dobra.asm**" });
    });
});
