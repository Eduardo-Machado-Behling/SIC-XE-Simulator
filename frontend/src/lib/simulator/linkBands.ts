// The bands of the linked program (.out): one per control section, coloured like the
// macro expansions, labelled with the file and section it came from, and hovered with
// where the loader put that section. A band click opens the section in its file.

import type { Translate } from "@/lib/i18n";
import type { LinkReport } from "@/lib/simulator/ExecutionEvent";
import { BAND_COLORS, type EditorBand } from "@/lib/simulator/macroBands";

export type LinkBand = EditorBand & { file: string; section: string };

const hex6 = (value: number) => value.toString(16).toUpperCase().padStart(6, "0");

export function linkBands(report: LinkReport, t: Translate): LinkBand[] {
    return report.out.bands.map((band, index) => {
        const row = report.estab.find((entry) => entry.symbol === "" && `${entry.file} · ${entry.section}` === band.label);
        const [file = "", section = ""] = row ? [row.file, row.section] : band.label.split(" · ");
        const start = report.loadAddress + (row?.address ?? 0);
        return {
            from: band.firstLine,
            to: band.lastLine,
            colorIndex: index % BAND_COLORS,
            label: band.label,
            file,
            section,
            hover: row && t("link.bandHover", {
                file, section, start: hex6(start), end: hex6(start + Math.max(row.length, 1) - 1), length: row.length,
            }),
        };
    });
}

// The 1-based line where a control section starts in its source: its START, ENTRY or CSECT.
export function sectionStartLine(source: string, section: string): number | null {
    const name = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const start = new RegExp(`^${name}\\s+(?:START|ENTRY|CSECT)\\b`, "i");
    const index = source.split("\n").findIndex((line) => start.test(line));
    return index < 0 ? null : index + 1;
}
