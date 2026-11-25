import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LinkerView } from "@/components/LinkerView";
import type { LinkReport } from "@/lib/simulator/ExecutionEvent";

const report: LinkReport = {
    loadAddress: 0x4000,
    estab: [
        { section: "PROGA", symbol: "", address: 0x0, length: 0x63, file: "proga.asm" },
        { section: "PROGA", symbol: "LISTA", address: 0x40, length: 0, file: "proga.asm" },
        { section: "PROGB", symbol: "", address: 0x63, length: 0x7f, file: "progb.asm" },
    ],
    objects: [],
    out: { name: "PROGA", text: "", bands: [] },
    trace: [
        { pass: "1", text: "PROGA placed at 000000", file: "proga.asm", line: 4, address: 0, before: 0, after: 0, symbol: "PROGA" },
        { pass: "2", text: "+LISTB at 000024", file: "proga.asm", line: 9, address: 0x24, before: 0x4, after: 0xc7, symbol: "LISTB" },
        { pass: "load", text: "field at 004024: 0000C7 -> 0040C7", file: "", line: 0, address: 0x4024, before: 0xc7, after: 0x40c7, symbol: "" },
    ],
};

describe("LinkerView", () => {
    it("asks for a Run before there is anything to show", () => {
        render(<LinkerView linked={null} onSelectStep={() => {}} />);
        expect(screen.getByRole("status").textContent).toMatch(/run/i);
    });

    it("shows the ESTAB in hexadecimal, with the origin of each row and the load address", () => {
        render(<LinkerView linked={report} onSelectStep={() => {}} />);
        const table = screen.getByRole("table", { name: "External symbol table (ESTAB)" });
        const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["Section", "Symbol", "Address", "Length", "Origin"]);
        const rows = within(table).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
        expect(rows).toEqual([
            ["PROGA", "", "000000", "000063", "proga.asm"],
            ["", "LISTA", "000040", "", "proga.asm"],
            ["PROGB", "", "000063", "00007F", "progb.asm"],
        ]);
        expect(screen.getByText("Load address 004000")).toBeTruthy();
    });

    it("groups the trace by pass and shows each field before and after", async () => {
        const user = userEvent.setup();
        render(<LinkerView linked={report} onSelectStep={() => {}} />);
        await user.click(screen.getByRole("tab", { name: "Trace" }));
        for (const heading of ["Pass 1", "Pass 2", "Loader"]) expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
        expect(screen.getByRole("button", { name: /\+LISTB at 000024.*000004 → 0000C7/ })).toBeTruthy();
    });

    it("hands a clicked step to the page", async () => {
        const user = userEvent.setup();
        const onSelectStep = vi.fn();
        render(<LinkerView linked={report} onSelectStep={onSelectStep} />);
        await user.click(screen.getByRole("tab", { name: "Trace" }));
        await user.click(screen.getByRole("button", { name: /\+LISTB at 000024/ }));
        expect(onSelectStep).toHaveBeenCalledWith(report.trace[1]);
    });
});
