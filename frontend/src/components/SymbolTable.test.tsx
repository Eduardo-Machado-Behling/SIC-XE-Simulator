import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SymbolTable } from "@/components/SymbolTable";

describe("SymbolTable", () => {
    it("explains that nothing has been assembled yet", () => {
        render(<SymbolTable symbols={null} />);

        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.getByRole("status").textContent).toMatch(/assemble/i);
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
});
