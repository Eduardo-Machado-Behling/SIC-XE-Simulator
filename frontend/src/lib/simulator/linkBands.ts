// The bands of the linked program (.out): one per control section, coloured like the
// macro expansions and labelled with the file and section it came from.

import type { LinkReport } from "@/lib/simulator/ExecutionEvent";
import { BAND_COLORS, type EditorBand } from "@/lib/simulator/macroBands";

export function linkBands(out: LinkReport["out"]): EditorBand[] {
    return out.bands.map((band, index) => ({
        from: band.firstLine,
        to: band.lastLine,
        colorIndex: index % BAND_COLORS,
        label: band.label,
    }));
}
