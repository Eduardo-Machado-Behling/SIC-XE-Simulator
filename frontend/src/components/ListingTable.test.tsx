import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ListingTable } from "@/components/ListingTable";
import type { AssemblyListingLine } from "@/lib/simulator/ExecutionEvent";

// Statements of Beck's Fig. 2.6 (lines 1-5 of the source), with their Loc and object code.
const LISTING: AssemblyListingLine[] = [
    { line: 1, address: 0x0000, bytes: [], source: "COPY     START   0" },
    { line: 2, address: 0x0000, bytes: [0x17, 0x20, 0x2D], source: "FIRST    STL     RETADR" },
    { line: 3, address: 0x0003, bytes: [0x69, 0x20, 0x2D], source: "         LDB     #LENGTH" },
    { line: 4, address: null, bytes: [], source: "         BASE    LENGTH" },
    { line: 5, address: 0x0006, bytes: [0x4B, 0x10, 0x10, 0x36], source: "CLOOP   +JSUB    RDREC" },
];

function cells(): string[][] {
    return within(screen.getByRole("table", { name: "Listing" }))
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent ?? ""));
}

describe("ListingTable", () => {
    it("has Beck's columns: line, location, source statement and object code", () => {
        render(<ListingTable listing={LISTING} />);

        expect(screen.getAllByRole("columnheader").map((header) => header.textContent))
            .toEqual(["Line", "Loc", "Source statement", "Object code"]);
    });

    it("lists every statement with its location and full object code in hexadecimal", () => {
        render(<ListingTable listing={LISTING} />);

        expect(cells()).toEqual([
            ["1", "000000", "COPY     START   0", ""],
            ["2", "000000", "FIRST    STL     RETADR", "17202D"],
            ["3", "000003", "         LDB     #LENGTH", "69202D"],
            ["4", "", "         BASE    LENGTH", ""],
            ["5", "000006", "CLOOP   +JSUB    RDREC", "4B101036"],
        ]);
    });

    it("marks the statement whose object code holds the PC", () => {
        render(<ListingTable listing={LISTING} pc={0x0008} />);

        const current = screen.getAllByRole("row").filter((row) => row.getAttribute("aria-current") === "true");
        expect(current.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["5"]);
    });

    it("marks nothing when the PC is outside the program's code", () => {
        render(<ListingTable listing={LISTING} pc={0x0036} />);

        expect(screen.getAllByRole("row").some((row) => row.hasAttribute("aria-current"))).toBe(false);
    });

    it("says so when the program has no statements", () => {
        render(<ListingTable listing={[]} />);

        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.getByRole("status").textContent).toMatch(/no statements/i);
    });

    it("says so when the assembler reported no listing", () => {
        render(<ListingTable listing={undefined} />);

        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.getByRole("status").textContent).toMatch(/did not report a listing/i);
    });
});
