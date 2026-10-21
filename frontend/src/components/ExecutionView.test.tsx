import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { Group, Panel } from "react-resizable-panels";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// jsdom has no layout. The memory table measures its rows viewport through a
// ResizeObserver, so the tests use one they trigger by hand and give the
// viewport a 300px height that, like a display:none element in a browser,
// reads 0 and drops scroll writes while the CPU tab panel is hidden. Rows are
// 30px (the table's default when it cannot measure them) and 1 KB of memory
// is 64 rows, so the PC row is centred at row * 30 + 15 - 150.
let resizeCallbacks: ResizeObserverCallback[] = [];

beforeEach(() => {
    resizeCallbacks = [];
    vi.stubGlobal("ResizeObserver", class {
        constructor(callback: ResizeObserverCallback) {
            resizeCallbacks.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
    });
});

function memoryRegion(): HTMLElement {
    return screen.getByRole("region", { name: "Memory", hidden: true });
}

function layOutMemory() {
    const region = memoryRegion();
    const panel = region.closest<HTMLElement>("[role=tabpanel]")!;
    let position = 0;

    Object.defineProperty(region, "clientHeight", {
        configurable: true,
        get: () => (panel.hidden ? 0 : 300),
    });
    Object.defineProperty(region, "scrollTop", {
        configurable: true,
        get: () => (panel.hidden ? 0 : position),
        set: (value: number) => {
            if (!panel.hidden) position = value;
        },
    });
    act(() => {
        for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
    });
}

function userScrollsMemoryTo(top: number) {
    memoryRegion().scrollTop = top;
    fireEvent.scroll(memoryRegion());
}

describe("ExecutionView", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
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

    it("centres the memory on the PC on return to CPU when the PC moved while CPU was hidden", async () => {
        const user = userEvent.setup();
        const { rerender } = render(inLayout(<ExecutionView {...props({ pc: 0, changeRevision: 1 })} />));
        layOutMemory();

        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        rerender(inLayout(<ExecutionView {...props({ pc: 0x200, changeRevision: 2 })} />));
        await user.click(screen.getByRole("tab", { name: "CPU" }));

        // Row 32 (0x200): 32 * 30 + 15 - 150.
        expect(memoryRegion().scrollTop).toBe(825);
    });

    it("keeps the user's memory scroll position on return to CPU when nothing ran meanwhile", async () => {
        const user = userEvent.setup();
        render(inLayout(<ExecutionView {...props({ pc: 0x200, changeRevision: 3 })} />));
        layOutMemory();
        userScrollsMemoryTo(400);

        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        await user.click(screen.getByRole("tab", { name: "CPU" }));

        expect(memoryRegion().scrollTop).toBe(400);
    });

    it("centres the memory on the PC on each execution update while CPU is shown", () => {
        const { rerender } = render(inLayout(<ExecutionView {...props({ pc: 0x200, changeRevision: 1 })} />));
        layOutMemory();
        userScrollsMemoryTo(0);

        rerender(inLayout(<ExecutionView {...props({ pc: 0x200, changeRevision: 2 })} />));
        expect(memoryRegion().scrollTop).toBe(825);

        // Row 48 (0x300): 48 * 30 + 15 - 150.
        rerender(inLayout(<ExecutionView {...props({ pc: 0x300, changeRevision: 3 })} />));
        expect(memoryRegion().scrollTop).toBe(1305);
    });
});
