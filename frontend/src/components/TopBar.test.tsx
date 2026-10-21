import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TopBar, type TopBarProps } from "@/components/TopBar";

function renderTopBar(overrides: Partial<TopBarProps> = {}) {
    const props: TopBarProps = {
        title: "Demo",
        isRunning: false,
        onRun: vi.fn(),
        onStop: vi.fn(),
        onStep: vi.fn(),
        onReset: vi.fn(),
        onClear: vi.fn(),
        onOpenCommandPalette: vi.fn(),
        ...overrides,
    };
    render(<TopBar {...props} />);
    return props;
}

describe("TopBar Clear button", () => {
    it("calls onClear, and nothing else", async () => {
        const user = userEvent.setup();
        const props = renderTopBar();

        await user.click(screen.getByRole("button", { name: "Clear" }));

        expect(props.onClear).toHaveBeenCalledTimes(1);
        for (const other of [props.onRun, props.onStop, props.onStep, props.onReset, props.onOpenCommandPalette]) {
            expect(other).not.toHaveBeenCalled();
        }
    });

    it("sits with the execution controls and looks like them", () => {
        renderTopBar();

        const names = screen.getAllByRole("button").map((button) => button.textContent);
        expect(names.slice(0, 4)).toEqual(["Run", "Step", "Reset", "Clear"]);

        const clear = screen.getByRole("button", { name: "Clear" });
        const step = screen.getByRole("button", { name: "Step" });
        expect(clear.className).toBe(step.className);
        expect(clear.querySelector("svg")?.getAttribute("width")).toBe(step.querySelector("svg")?.getAttribute("width"));
    });
});
