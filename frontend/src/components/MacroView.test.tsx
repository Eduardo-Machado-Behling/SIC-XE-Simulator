import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MacroView } from "@/components/MacroView";
import demoPayload from "@/lib/simulator/__fixtures__/macros-demo.json";
import type { MacroReport } from "@/lib/simulator/ExecutionEvent";
import { macroReportFixture } from "@/lib/simulator/macroFixtures";

function renderView(report = macroReportFixture, onSelectExpansion = vi.fn()) {
    render(<MacroView report={report} onSelectExpansion={onSelectExpansion} />);
    return onSelectExpansion;
}

describe("MacroView", () => {
    it("shows the empty state without a report", () => {
        render(<MacroView report={null} onSelectExpansion={vi.fn()} />);
        expect(screen.getByText("Run a program that uses MCDEFN to see the macro processor")).toBeTruthy();
        expect(screen.queryByRole("table")).toBeNull();
    });

    it("shows the empty state for a report without macros", () => {
        renderView({ ...macroReportFixture, hasMacros: false, names: [], definitions: [], expansions: [] });
        expect(screen.getByText("Run a program that uses MCDEFN to see the macro processor")).toBeTruthy();
    });

    it("lists the macro names with prototype and line", () => {
        renderView();
        const table = screen.getByRole("table", { name: "Macro name table" });
        expect(within(table).getByRole("columnheader", { name: "Prototype" })).toBeTruthy();
        expect(within(table).getByRole("cell", { name: "SOMA" })).toBeTruthy();
        expect(within(table).getByRole("cell", { name: "DOBRA" })).toBeTruthy();
        expect(within(table).getByRole("cell", { name: "L DOBRA V" })).toBeTruthy();
    });

    it("shows each definition with its header and display body", () => {
        renderView();
        expect(screen.getByText("SOMA — defined at line 2")).toBeTruthy();
        const body = screen.getByRole("table", { name: "SOMA definition 0 body" });
        expect(within(body).getByText("#0 LDA #1")).toBeTruthy();
    });

    it("marks the redefined definition as inactive", () => {
        renderView();
        const inactive = screen.getByRole("group", { name: "TRIPLA — defined at line 20" });
        expect(within(inactive).getByText("redefined")).toBeTruthy();
        expect(inactive.classList.contains("opacity-50")).toBe(true);
        const active = screen.getByRole("group", { name: "TRIPLA — defined at line 24" });
        expect(within(active).queryByText("redefined")).toBeNull();
        expect(active.classList.contains("opacity-50")).toBe(false);
    });

    it("names a definition created by an expansion", () => {
        const [first, ...rest] = macroReportFixture.definitions;
        renderView({
            ...macroReportFixture,
            definitions: [{ ...first, origin: { kind: "expansion", serial: 4 } }, ...rest],
        });
        expect(screen.getByText("SOMA — created by expansion #004")).toBeTruthy();
    });

    it("lists the expansions with indented nesting and arguments", () => {
        renderView();
        const table = screen.getByRole("table", { name: "Macro expansion table" });
        const rows = within(table).getAllByRole("row");
        expect(rows).toHaveLength(4);
        expect(within(rows[1]).getByText("#0=INICIO #1=N")).toBeTruthy();
        expect(within(rows[1]).getByText("3-7")).toBeTruthy();
        expect(within(rows[3]).getByText("#0= #1=N #2=M #3=TOTAL")).toBeTruthy();
        const nested = within(rows[2]).getByText("SOMA");
        expect(nested.style.paddingLeft).toBe("1rem");
        expect(within(rows[1]).getByText("DOBRA").style.paddingLeft).toBe("0rem");
    });

    it("selects an expansion by its serial when its row is clicked", async () => {
        const onSelect = renderView();
        const table = screen.getByRole("table", { name: "Macro expansion table" });
        await userEvent.click(within(table).getAllByRole("row")[1]);
        expect(onSelect).toHaveBeenCalledWith(1);
    });

    it("shows the trace in the Trace sub-tab and forwards line selections", async () => {
        const onSelectLine = vi.fn();
        render(<MacroView report={demoPayload as MacroReport} onSelectExpansion={vi.fn()} onSelectLine={onSelectLine} />);
        await userEvent.click(screen.getByRole("tab", { name: "Trace" }));
        const panel = screen.getByRole("tabpanel", { name: "Trace" });
        expect(within(panel).getByRole("table", { name: "Macro processor trace" })).toBeTruthy();
        await userEvent.click(within(panel).getByRole("button", { name: "Next step" }));
        expect(onSelectLine).toHaveBeenCalledWith(expect.objectContaining({ file: "source" }));
    });

    describe("with the real demo payload", () => {
        const demo = demoPayload as MacroReport;

        it("renders the three tables with five expansion rows", () => {
            renderView(demo);
            const names = screen.getByRole("table", { name: "Macro name table" });
            expect(within(names).getByRole("cell", { name: "MULTK" })).toBeTruthy();
            const expansions = screen.getByRole("table", { name: "Macro expansion table" });
            expect(within(expansions).getAllByRole("row")).toHaveLength(1 + 5);
            expect(screen.getAllByRole("group").length).toBe(demo.definitions.length);
        });

        it("heads MULTK's definition with the expansion that created it", () => {
            renderView(demo);
            expect(screen.getByText("MULTK — created by expansion #004")).toBeTruthy();
        });

        it("shows the creating expansion, not 0, in the Lines column of MULTK", () => {
            renderView(demo);
            const row = within(screen.getByRole("table", { name: "Macro name table" }))
                .getByRole("cell", { name: "MULTK" }).closest("tr")!;
            const cells = within(row).getAllByRole("cell");
            expect(cells[2].textContent).toBe("#004");
        });
    });
});
