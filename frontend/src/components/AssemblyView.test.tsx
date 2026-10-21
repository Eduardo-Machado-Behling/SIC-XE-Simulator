import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssemblyView } from "@/components/AssemblyView";
import type { AssemblyReport } from "@/lib/simulator/ExecutionEvent";
import { hex, hexBytes } from "@/lib/simulator/hex";

// The real formatters, spied on: every listing row and Text record formats its
// object code with hexBytes, so its calls show which of them rendered.
vi.mock("@/lib/simulator/hex", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/simulator/hex")>();
    return { hex: vi.fn(actual.hex), hexBytes: vi.fn(actual.hexBytes) };
});

beforeEach(() => {
    vi.mocked(hex).mockClear();
    vi.mocked(hexBytes).mockClear();
});

const REPORT: AssemblyReport = {
    symbols: [{ name: "FIRST", value: 0x1000 }],
    program: { name: "COPY", start: 0x1000, length: 0x77, entry: 0x1003 },
    listing: [
        { line: 1, address: 0x1000, bytes: [], source: "COPY     START   0x1000" },
        { line: 2, address: 0x1000, bytes: [0x17, 0x20, 0x2D], source: "FIRST    STL     RETADR" },
    ],
    relocations: [{ address: 0x1007, halfBytes: 5 }],
    diagnostics: [{ severity: "warning", line: 2, column: 10, message: "Look here" }],
};

function summary(): Record<string, string> {
    const list = screen.getByRole("group", { name: "Program" });
    const terms = within(list).getAllByRole("term").map((term) => term.textContent ?? "");
    const values = within(list).getAllByRole("definition").map((value) => value.textContent ?? "");
    return Object.fromEntries(terms.map((term, index) => [term, values[index]]));
}

describe("AssemblyView", () => {
    it("says no report is available, without claiming nothing was run", () => {
        render(<AssemblyView assembly={null} pc={0} />);

        expect(screen.queryByRole("tablist")).toBeNull();
        const message = screen.getByRole("status").textContent;
        expect(message).toMatch(/no assembly report/i);
        expect(message).not.toMatch(/nothing assembled|run an/i);
    });

    it("summarises the program in hexadecimal", () => {
        render(<AssemblyView assembly={REPORT} pc={0} />);

        expect(summary()).toEqual({ Program: "COPY", Start: "001000", Length: "000077", Entry: "001003" });
    });

    it("opens on the listing and has a sub-view per part of the report", async () => {
        const user = userEvent.setup();
        render(<AssemblyView assembly={REPORT} pc={0} />);

        const tabs = within(screen.getByRole("tablist", { name: "Assembly" })).getAllByRole("tab");
        expect(tabs.map((tab) => tab.textContent))
            .toEqual(["Listing", "Symbols", "Relocation", "Object", "Warnings (1)"]);
        expect(within(screen.getByRole("tabpanel")).getByRole("table", { name: "Listing" })).toBeTruthy();

        await user.click(screen.getByRole("tab", { name: "Symbols" }));
        expect(within(screen.getByRole("tabpanel")).getByRole("table", { name: "Symbol table" })).toBeTruthy();

        await user.click(screen.getByRole("tab", { name: "Relocation" }));
        expect(within(screen.getByRole("tabpanel")).getByText("M00000705")).toBeTruthy();

        await user.click(screen.getByRole("tab", { name: "Object" }));
        expect(within(screen.getByRole("tabpanel")).getByRole("list", { name: "Object program" })).toBeTruthy();

        await user.click(screen.getByRole("tab", { name: "Warnings (1)" }));
        expect(within(screen.getByRole("tabpanel")).getByText(/Look here/)).toBeTruthy();
    });

    it("highlights the listing row at the PC", () => {
        render(<AssemblyView assembly={REPORT} pc={0x1001} />);

        const current = screen.getAllByRole("row").filter((row) => row.getAttribute("aria-current") === "true");
        expect(current.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["2"]);
    });

    it("shows the symbols of a symbols-only report and explains what is missing", async () => {
        const user = userEvent.setup();
        render(<AssemblyView assembly={{ symbols: [{ name: "FIRST", value: 0x1000 }] }} pc={0} />);

        expect(screen.queryByRole("group", { name: "Program" })).toBeNull();
        expect(within(screen.getByRole("tabpanel")).getByRole("status").textContent).toMatch(/did not report a listing/i);
        expect(screen.getByRole("tab", { name: "Warnings" })).toBeTruthy();

        await user.click(screen.getByRole("tab", { name: "Symbols" }));
        expect(within(screen.getByRole("tabpanel")).getByText("FIRST")).toBeTruthy();
    });

    describe("rendering cost", () => {
        // Three RSUBs at 1000, 1003 and 1006, all in one Text record.
        const PROGRAM: AssemblyReport = {
            symbols: [{ name: "A", value: 0x1000 }],
            program: { name: "P", start: 0x1000, length: 9, entry: 0x1000 },
            listing: [
                { line: 1, address: 0x1000, bytes: [0x4F, 0x00, 0x00], source: "A        RSUB" },
                { line: 2, address: 0x1003, bytes: [0x4F, 0x00, 0x01], source: "B        RSUB" },
                { line: 3, address: 0x1006, bytes: [0x4F, 0x00, 0x02], source: "C        RSUB" },
            ],
            relocations: [{ address: 0x1001, halfBytes: 5 }],
            diagnostics: [],
        };

        it("does nothing when re-rendered with the same report and PC, as on an editor keystroke", () => {
            const { rerender } = render(<AssemblyView assembly={PROGRAM} pc={0x1000} />);
            vi.mocked(hex).mockClear();
            vi.mocked(hexBytes).mockClear();

            rerender(<AssemblyView assembly={PROGRAM} pc={0x1000} />);

            expect(hex).not.toHaveBeenCalled();
            expect(hexBytes).not.toHaveBeenCalled();
        });

        it("re-renders only the listing rows whose highlight moves when the PC changes", () => {
            const { rerender } = render(<AssemblyView assembly={PROGRAM} pc={0x1000} />);
            vi.mocked(hexBytes).mockClear();

            rerender(<AssemblyView assembly={PROGRAM} pc={0x1003} />);

            expect(vi.mocked(hexBytes).mock.calls).toEqual([[[0x4F, 0x00, 0x00]], [[0x4F, 0x00, 0x01]]]);
            const current = screen.getAllByRole("row").filter((row) => row.getAttribute("aria-current") === "true");
            expect(current.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["2"]);
        });
    });
});
