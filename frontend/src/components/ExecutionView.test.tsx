import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { Group, Panel } from "react-resizable-panels";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecutionView, type ArchProps } from "@/components/ExecutionView";
import type { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";

const ARCH: ArchitectureInfo = {
    name: "SIC/XE",
    description: "SIC/XE architecture",
    memory: { address_space_size: 1 << 10, address_width: 4, word_size: 3, alignment: 1, endianness: "big" },
    registers: [{ id: 0, name: "A", description: "Accumulator", width: 3, type: "special_purpose" }],
    instructions: [],
};

function props(overrides: Partial<ArchProps> = {}): ArchProps {
    return {
        arch: ARCH,
        memorySize: 1 << 10,
        memory: new Map([[0, 0xAB]]),
        registers: [{ id: 0, name: "A", value: 0x123456 }],
        pc: 0,
        changedMemory: [],
        changedRegisters: [],
        changeRevision: 0,
        consumedMemory: [],
        symbols: null,
        ...overrides,
    };
}

// EditorPage renders the view inside a resizable Panel, whose Group its Separator needs.
function inLayout(view: ReactElement): ReactElement {
    return (
        <Group orientation="horizontal">
            <Panel>{view}</Panel>
        </Group>
    );
}

// jsdom has no layout, so scrolling is observed through the calls the memory
// table makes to scroll its rows container.
function spyOnScrolling() {
    return vi.spyOn(Element.prototype, "scrollTo");
}

describe("ExecutionView", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("opens on the CPU tab, which shows the registers and the memory", () => {
        render(inLayout(<ExecutionView {...props()} />));

        const cpu = screen.getByRole("tabpanel", { name: "CPU" });
        expect(within(cpu).getByText("0x123456")).toBeTruthy();
        expect(within(cpu).getByText("AB")).toBeTruthy();
        expect(screen.queryByRole("tabpanel", { name: "Assembler" })).toBeNull();
    });

    it("shows the latest symbol table on the Assembler tab", async () => {
        const user = userEvent.setup();
        const { rerender } = render(inLayout(<ExecutionView {...props({ symbols: [{ name: "FIRST", value: 0x1000 }] })} />));

        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        expect(within(screen.getByRole("tabpanel", { name: "Assembler" })).getByText("FIRST")).toBeTruthy();

        rerender(inLayout(<ExecutionView {...props({ symbols: [{ name: "AGAIN", value: 0x2000 }] })} />));
        const assembler = screen.getByRole("tabpanel", { name: "Assembler" });
        expect(within(assembler).getByText("AGAIN")).toBeTruthy();
        expect(within(assembler).queryByText("FIRST")).toBeNull();
    });

    it("shows an empty state on the Assembler tab before anything is assembled", async () => {
        const user = userEvent.setup();
        render(inLayout(<ExecutionView {...props({ symbols: null })} />));

        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        expect(within(screen.getByRole("tabpanel", { name: "Assembler" })).getByRole("status")).toBeTruthy();
    });

    it("keeps the register and memory values when switching back to CPU", async () => {
        const user = userEvent.setup();
        render(inLayout(<ExecutionView {...props()} />));

        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        await user.click(screen.getByRole("tab", { name: "CPU" }));

        const cpu = screen.getByRole("tabpanel", { name: "CPU" });
        expect(within(cpu).getByText("0x123456")).toBeTruthy();
        expect(within(cpu).getByText("AB")).toBeTruthy();
    });

    it("scrolls the memory to the PC on return to CPU when the PC moved while CPU was hidden", async () => {
        const user = userEvent.setup();
        const { rerender } = render(inLayout(<ExecutionView {...props({ pc: 0, changeRevision: 1 })} />));

        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        rerender(inLayout(<ExecutionView {...props({ pc: 0x40, changeRevision: 2 })} />));

        const scrollTo = spyOnScrolling();
        await user.click(screen.getByRole("tab", { name: "CPU" }));

        expect(scrollTo).toHaveBeenCalled();
    });

    it("keeps the user's memory scroll position on return to CPU when nothing ran meanwhile", async () => {
        const user = userEvent.setup();
        render(inLayout(<ExecutionView {...props({ pc: 0x40, changeRevision: 3 })} />));

        const scrollTo = spyOnScrolling();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        await user.click(screen.getByRole("tab", { name: "CPU" }));

        expect(scrollTo).not.toHaveBeenCalled();
    });

    it("scrolls the memory to the PC on each execution update while CPU is shown", () => {
        const { rerender } = render(inLayout(<ExecutionView {...props({ pc: 0, changeRevision: 1 })} />));

        const scrollTo = spyOnScrolling();
        rerender(inLayout(<ExecutionView {...props({ pc: 0, changeRevision: 2 })} />));

        expect(scrollTo).toHaveBeenCalledTimes(1);
    });
});
