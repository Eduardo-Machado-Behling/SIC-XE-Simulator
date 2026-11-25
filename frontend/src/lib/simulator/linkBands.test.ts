import { describe, expect, it } from "vitest";

import { linkBands } from "@/lib/simulator/linkBands";
import { bandDecorations } from "@/lib/simulator/macroBands";

const out = {
    name: "PROG",
    text: "",
    bands: [
        { firstLine: 2, lastLine: 5, label: "main.asm · PROG" },
        { firstLine: 6, lastLine: 7, label: "dobra.asm · DOBRA" },
    ],
};

describe("linkBands", () => {
    it("gives each section of the linked program its own band, colour and origin label", () => {
        expect(linkBands(out)).toEqual([
            { from: 2, to: 5, colorIndex: 0, label: "main.asm · PROG" },
            { from: 6, to: 7, colorIndex: 1, label: "dobra.asm · DOBRA" },
        ]);
    });

    it("reuses the macro palette, which has six colours", () => {
        const many = { ...out, bands: Array.from({ length: 7 }, (_, i) => ({ firstLine: i + 1, lastLine: i + 1, label: `s${i}` })) };
        expect(linkBands(many).map((band) => band.colorIndex)).toEqual([0, 1, 2, 3, 4, 5, 0]);
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
});
