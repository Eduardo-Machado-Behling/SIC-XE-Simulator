import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssemblyWarnings } from "@/components/AssemblyWarnings";

describe("AssemblyWarnings", () => {
    it("lists each warning with its line, and its column when known", () => {
        render(
            <AssemblyWarnings
                diagnostics={[
                    { severity: "warning", line: 4, column: 0, message: "Missing END directive" },
                    { severity: "warning", line: 9, column: 14, message: "Direct addressing cannot be relocated" },
                ]}
            />,
        );

        const items = within(screen.getByRole("list", { name: "Warnings" })).getAllByRole("listitem");
        expect(items.map((item) => item.textContent)).toEqual([
            "Line 4: Missing END directive",
            "Line 9, column 14: Direct addressing cannot be relocated",
        ]);
    });

    it("says so when there are no warnings", () => {
        render(<AssemblyWarnings diagnostics={[]} />);

        expect(screen.queryByRole("list")).toBeNull();
        expect(screen.getByRole("status").textContent).toMatch(/no warnings/i);
    });

    it("says so when the assembler reported no warnings list", () => {
        render(<AssemblyWarnings diagnostics={undefined} />);

        expect(screen.getByRole("status").textContent).toMatch(/did not report/i);
    });
});
