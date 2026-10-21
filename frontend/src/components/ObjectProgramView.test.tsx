import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ObjectProgramView } from "@/components/ObjectProgramView";
import type { AssemblyReport } from "@/lib/simulator/ExecutionEvent";

const REPORT: AssemblyReport = {
    symbols: [],
    program: { name: "COPY", start: 0, length: 0x1077, entry: 0 },
    listing: [
        { line: 2, address: 0x0000, bytes: [0x17, 0x20, 0x2D], source: "FIRST    STL     RETADR" },
        { line: 5, address: 0x0006, bytes: [0x4B, 0x10, 0x10, 0x36], source: "CLOOP   +JSUB    RDREC" },
    ],
    relocations: [{ address: 0x07, halfBytes: 5 }],
};

describe("ObjectProgramView", () => {
    it("shows one line per record, in Beck's record format", () => {
        render(<ObjectProgramView report={REPORT} />);

        const records = within(screen.getByRole("list", { name: "Object program" })).getAllByRole("listitem");
        expect(records.map((record) => record.textContent)).toEqual([
            "HCOPY  000000001077",
            "T00000003" + "17202D",
            "T00000604" + "4B101036",
            "M00000705",
            "E000000",
        ]);
    });

    it("cannot build an object program from a symbols-only report", () => {
        render(<ObjectProgramView report={{ symbols: [{ name: "FIRST", value: 0 }] }} />);

        expect(screen.queryByRole("list")).toBeNull();
        expect(screen.getByRole("status").textContent).toMatch(/did not report/i);
    });
});
