import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SymbolTable } from "@/components/SymbolTable";

describe("SymbolTable", () => {
    it("says no symbol table is available, without claiming nothing was run", () => {
        // null also follows a run whose events carried no symbol table, so the
        // message must hold both before and after a run.
        render(<SymbolTable symbols={null} />);

        expect(screen.queryByRole("table")).toBeNull();
        const message = screen.getByRole("status").textContent;
        expect(message).toMatch(/no symbol table/i);
        expect(message).not.toMatch(/nothing assembled|run an/i);
    });

    it("says so when the assembled program defines no symbols", () => {
        render(<SymbolTable symbols={[]} />);

        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.getByRole("status").textContent).toMatch(/no symbols/i);
    });

    it("lists each symbol with its address in hexadecimal, in the order received", () => {
        render(
            <SymbolTable
                symbols={[
                    { name: "FIRST", value: 0x1000 },
                    { name: "LOOP", value: 0x1006 },
                    { name: "BUFFER", value: 0x36 },
                ]}
            />,
        );

        const rows = within(screen.getByRole("table", { name: "Symbol table" })).getAllByRole("row");
        const cells = rows.map((row) => within(row).queryAllByRole("cell").map((cell) => cell.textContent));

        expect(cells.filter((row) => row.length > 0)).toEqual([
            ["FIRST", "001000"],
            ["LOOP", "001006"],
            ["BUFFER", "000036"],
        ]);
    });

    it("labels the second column as a value, since EQU symbols are not addresses", () => {
        render(<SymbolTable symbols={[{ name: "LENGTH", value: 3 }]} />);

        expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Symbol", "Value"]);
    });

    it("shows negative values as 24-bit two's complement and keeps wide values whole", () => {
        render(
            <SymbolTable
                symbols={[
                    { name: "MINUS1", value: -1 },
                    { name: "MINUS26", value: -26 },
                    { name: "WIDE", value: 0x1000000 },
                ]}
            />,
        );

        const values = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[1].textContent);
        expect(values).toEqual(["FFFFFF", "FFFFE6", "1000000"]);
    });
});
