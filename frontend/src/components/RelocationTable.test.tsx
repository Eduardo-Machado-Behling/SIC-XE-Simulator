import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RelocationTable } from "@/components/RelocationTable";

describe("RelocationTable", () => {
    it("lists each modification record with its address, length and Fig. 2.8 text", () => {
        render(
            <RelocationTable
                start={0}
                relocations={[
                    { address: 0x07, halfBytes: 5 },
                    { address: 0x14, halfBytes: 5 },
                    { address: 0x1234, halfBytes: 6 },
                ]}
            />,
        );

        const table = screen.getByRole("table", { name: "Modification records" });
        expect(within(table).getAllByRole("columnheader").map((header) => header.textContent))
            .toEqual(["Address", "Half-bytes", "Record"]);
        expect(within(table).getAllByRole("row").slice(1).map((row) =>
            within(row).getAllByRole("cell").map((cell) => cell.textContent),
        )).toEqual([
            ["000007", "5", "M00000705"],
            ["000014", "5", "M00001405"],
            ["001234", "6", "M00123406"],
        ]);
    });

    it("writes the record relative to the start of the program, as Beck's loader expects (p. 64)", () => {
        render(<RelocationTable start={0x1000} relocations={[{ address: 0x1001, halfBytes: 5 }]} />);

        const table = screen.getByRole("table", { name: "Modification records" });
        expect(within(table).getAllByRole("row").slice(1).map((row) =>
            within(row).getAllByRole("cell").map((cell) => cell.textContent),
        )).toEqual([["001001", "5", "M00000105"]]);
    });

    it("leaves the record out when the program's start is unknown", () => {
        render(<RelocationTable start={undefined} relocations={[{ address: 0x1001, halfBytes: 5 }]} />);

        const table = screen.getByRole("table", { name: "Modification records" });
        expect(within(table).getAllByRole("columnheader").map((header) => header.textContent))
            .toEqual(["Address", "Half-bytes"]);
        expect(within(table).getAllByRole("row").slice(1).map((row) =>
            within(row).getAllByRole("cell").map((cell) => cell.textContent),
        )).toEqual([["001001", "5"]]);
    });

    it("says so when no address needs relocation", () => {
        render(<RelocationTable start={0} relocations={[]} />);

        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.getByRole("status").textContent).toMatch(/no modification records/i);
    });

    it("says so when the assembler reported no relocations", () => {
        render(<RelocationTable start={undefined} relocations={undefined} />);

        expect(screen.getByRole("status").textContent).toMatch(/did not report/i);
    });
});
