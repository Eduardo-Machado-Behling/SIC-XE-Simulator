import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Tabs, type TabDefinition } from "@/components/Tabs";

function Counter() {
    const [count, setCount] = useState(0);
    return (
        <button type="button" onClick={() => setCount(count + 1)}>
            clicked {count}
        </button>
    );
}

const TABS: TabDefinition[] = [
    { id: "cpu", label: "CPU", content: <Counter /> },
    { id: "assembler", label: "Assembler", content: <p>symbols here</p> },
    { id: "listing", label: "Listing", content: <p>listing here</p> },
];

function selectedTab(): string | null {
    return screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent ?? null;
}

describe("Tabs", () => {
    it("selects the first tab by default and shows only its panel", () => {
        render(<Tabs label="Execution view" tabs={TABS} />);

        expect(selectedTab()).toBe("CPU");
        expect(screen.getByRole("tabpanel", { name: "CPU" })).toBeTruthy();
        expect(screen.queryByRole("tabpanel", { name: "Assembler" })).toBeNull();
        expect(screen.queryByRole("tabpanel", { name: "Listing" })).toBeNull();
    });

    it("can start on another tab", () => {
        render(<Tabs label="Execution view" tabs={TABS} defaultTabId="assembler" />);

        expect(selectedTab()).toBe("Assembler");
        expect(screen.getByRole("tabpanel", { name: "Assembler" })).toBeTruthy();
    });

    it("shows a tab's panel when the tab is clicked", async () => {
        const user = userEvent.setup();
        render(<Tabs label="Execution view" tabs={TABS} />);

        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        expect(selectedTab()).toBe("Assembler");
        expect(screen.getByRole("tabpanel", { name: "Assembler" }).textContent).toBe("symbols here");
        expect(screen.queryByRole("tabpanel", { name: "CPU" })).toBeNull();
    });

    it("moves selection and focus with the arrow keys, Home and End, wrapping around", async () => {
        const user = userEvent.setup();
        render(<Tabs label="Execution view" tabs={TABS} />);
        screen.getByRole("tab", { name: "CPU" }).focus();

        await user.keyboard("{ArrowRight}");
        expect(selectedTab()).toBe("Assembler");
        expect(document.activeElement?.textContent).toBe("Assembler");

        await user.keyboard("{End}");
        expect(selectedTab()).toBe("Listing");

        await user.keyboard("{ArrowRight}");
        expect(selectedTab()).toBe("CPU");

        await user.keyboard("{ArrowLeft}");
        expect(selectedTab()).toBe("Listing");

        await user.keyboard("{Home}");
        expect(selectedTab()).toBe("CPU");
        expect(document.activeElement?.textContent).toBe("CPU");
    });

    it("keeps a panel's state while another tab is shown", async () => {
        const user = userEvent.setup();
        render(<Tabs label="Execution view" tabs={TABS} />);

        await user.click(screen.getByRole("button", { name: "clicked 0" }));
        await user.click(screen.getByRole("button", { name: "clicked 1" }));
        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        await user.click(screen.getByRole("tab", { name: "CPU" }));

        expect(screen.getByRole("button", { name: "clicked 2" })).toBeTruthy();
    });

    it("puts only the selected tab in the tab order", async () => {
        const user = userEvent.setup();
        render(<Tabs label="Execution view" tabs={TABS} />);

        await user.click(screen.getByRole("tab", { name: "Listing" }));

        const tabIndexes = screen.getAllByRole("tab").map((tab) => [tab.textContent, tab.tabIndex]);
        expect(tabIndexes).toEqual([["CPU", -1], ["Assembler", -1], ["Listing", 0]]);
    });

    it("ties each tab to its panel for assistive technology", () => {
        render(<Tabs label="Execution view" tabs={TABS} />);

        const tablist = screen.getByRole("tablist", { name: "Execution view" });
        expect(tablist).toBeTruthy();

        for (const tab of screen.getAllByRole("tab")) {
            const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
            expect(panel?.getAttribute("role")).toBe("tabpanel");
            expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
        }
    });
});
