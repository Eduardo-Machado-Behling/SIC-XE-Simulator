import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MacroTrace } from "@/components/MacroTrace";
import fig412 from "@/lib/simulator/__fixtures__/macros-fig412.json";
import demo from "@/lib/simulator/__fixtures__/macros-demo.json";
import type { MacroReport, MacroTraceStep } from "@/lib/simulator/ExecutionEvent";

const report = fig412 as unknown as MacroReport;

function renderTrace(overrides: Partial<MacroReport> = {}, onSelectLine = vi.fn()) {
    render(<MacroTrace report={{ ...report, ...overrides }} onSelectLine={onSelectLine} />);
    return onSelectLine;
}

function litPill() {
    return ["Normal", "Definition", "Expansion"].filter(
        (name) => screen.getByText(name).getAttribute("aria-current") === "true",
    );
}

describe("MacroTrace", () => {
    it("lists the 20 steps of Figure 4.12", () => {
        renderTrace();
        const table = screen.getByRole("table", { name: "Macro processor trace" });
        for (const name of ["Step", "Read", "d", "e", "Text", "Action"]) {
            expect(within(table).getByRole("columnheader", { name })).toBeTruthy();
        }
        expect(within(table).getAllByRole("row")).toHaveLength(21);
    });

    it("formats read, e and action columns", () => {
        renderTrace();
        const rows = screen.getAllByRole("row");
        expect(within(rows[9]).getByText("line 9")).toBeTruthy();
        expect(within(rows[10]).getByText("#001 · line 1")).toBeTruthy();
        expect(within(rows[10]).getByText("true")).toBeTruthy();
        expect(within(rows[11]).getByText("→ output 2")).toBeTruthy();
        expect(within(rows[2]).getByText("→ A line 1")).toBeTruthy();
        expect(within(rows[9]).getByText("→ expansion #001")).toBeTruthy();
    });

    it("shows true ×2 beyond depth 1", () => {
        const deep: MacroTraceStep = { ...report.trace.steps[10], depth: 2 };
        renderTrace({ trace: { truncated: false, steps: [deep] } });
        expect(screen.getByText("true ×2")).toBeTruthy();
    });

    it("steps with the buttons and lights the Definition pill at step 2", async () => {
        const user = userEvent.setup();
        renderTrace();
        expect(screen.getAllByRole("row")[1].getAttribute("aria-current")).toBe("step");
        await user.click(screen.getByRole("button", { name: "Next step" }));
        expect(screen.getAllByRole("row")[2].getAttribute("aria-current")).toBe("step");
        expect(litPill()).toEqual(["Definition"]);
        await user.click(screen.getByRole("button", { name: "Previous step" }));
        expect(screen.getAllByRole("row")[1].getAttribute("aria-current")).toBe("step");
    });

    it("goes back to the first step when a new report arrives", async () => {
        const user = userEvent.setup();
        const { rerender } = render(<MacroTrace report={report} onSelectLine={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Next step" }));
        await user.click(screen.getByRole("button", { name: "Next step" }));
        expect(screen.getAllByRole("row")[3].getAttribute("aria-current")).toBe("step");

        rerender(<MacroTrace report={{ ...report }} onSelectLine={vi.fn()} />);
        expect(screen.getAllByRole("row")[1].getAttribute("aria-current")).toBe("step");
        expect(screen.getByText("1 / 20")).toBeTruthy();
    });

    it("lights Expansion for e without definition, and Normal otherwise", () => {
        renderTrace();
        fireEvent.change(screen.getByRole("slider", { name: "Trace step" }), { target: { value: "9" } });
        expect(litPill()).toEqual(["Normal"]); // step 9, call
        fireEvent.change(screen.getByRole("slider", { name: "Trace step" }), { target: { value: "10" } });
        expect(litPill()).toEqual(["Expansion"]); // step 10, read-prototype
        fireEvent.change(screen.getByRole("slider", { name: "Trace step" }), { target: { value: "12" } });
        expect(litPill()).toEqual(["Definition"]); // define-start inside an expansion
    });

    it("disables the buttons at the ends", async () => {
        renderTrace();
        expect((screen.getByRole("button", { name: "Previous step" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByRole("slider", { name: "Trace step" }), { target: { value: "20" } });
        expect((screen.getByRole("button", { name: "Next step" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("selects the source line for a source read and the output line for a copy", () => {
        const onSelectLine = renderTrace();
        const slider = screen.getByRole("slider", { name: "Trace step" });
        fireEvent.change(slider, { target: { value: "2" } });
        expect(onSelectLine).toHaveBeenLastCalledWith({ file: "source", line: 2 });
        fireEvent.change(slider, { target: { value: "10" } }); // read-prototype of an expansion
        expect(onSelectLine).toHaveBeenCalledTimes(1);
        fireEvent.change(slider, { target: { value: "11" } });
        expect(onSelectLine).toHaveBeenLastCalledWith({ file: "output", line: 2 });
    });

    it("does not navigate on first render", () => {
        const onSelectLine = renderTrace();
        expect(onSelectLine).not.toHaveBeenCalled();
    });

    it("warns when truncated", () => {
        renderTrace({ trace: { truncated: true, steps: report.trace.steps } });
        expect(screen.getByText("Trace truncated at 5000 steps")).toBeTruthy();
    });

    it("shows no warning otherwise", () => {
        renderTrace();
        expect(screen.queryByText("Trace truncated at 5000 steps")).toBeNull();
    });

    it("renders the demo program trace", () => {
        const demoReport = demo as unknown as MacroReport;
        render(<MacroTrace report={demoReport} onSelectLine={vi.fn()} />);
        expect(screen.getAllByRole("row")).toHaveLength(demoReport.trace.steps.length + 1);
    });

    // The Text column is cut with an ellipsis so that Action stays on screen;
    // the whole line, comment included, stays reachable as a tooltip.
    it("keeps the whole text of a long step in its title", () => {
        const demoReport = demo as unknown as MacroReport;
        const long = demoReport.trace.steps.reduce((a, b) => (b.text.length > a.text.length ? b : a));
        expect(long.text.length).toBeGreaterThan(60);
        render(<MacroTrace report={demoReport} onSelectLine={vi.fn()} />);
        const row = screen.getAllByRole("row")[long.step];
        const text = within(row).getAllByRole("cell")[4];
        const element = text.querySelector("[title]");
        expect(element?.getAttribute("title")).toBe(long.text);
        expect(element?.textContent).toBe(long.text);
    });

    it("handles an empty trace", () => {
        renderTrace({ trace: { truncated: false, steps: [] } });
        expect(screen.getByText("No trace steps")).toBeTruthy();
    });

    it("renders a 5000-step trace", () => {
        const steps = Array.from({ length: 5000 }, (_, i) => ({ ...report.trace.steps[0], step: i + 1 }));
        renderTrace({ trace: { truncated: true, steps } });
        expect(screen.getAllByRole("row")).toHaveLength(5001);
    });
});
