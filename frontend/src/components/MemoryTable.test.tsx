import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryTable, type MemoryTableProps } from "@/components/MemoryTable";

// jsdom has no layout engine, so the layout the table reads is stubbed here,
// explicitly:
// - the scroll region's clientHeight is defined per test (the rows viewport);
// - getBoundingClientRect is all zeros in jsdom, so the sticky header measures
//   0px and the row pitch cannot be measured: the table then uses its default
//   30px row (20px line + 2 * 5px padding);
// - ResizeObserver is replaced by one the test triggers by hand.
// scrollTop itself is real: jsdom stores what the component writes.

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

afterEach(() => {
    vi.unstubAllGlobals();
});

const ROW = 30;

function props(overrides: Partial<MemoryTableProps> = {}): MemoryTableProps {
    return {
        memory: new Map(),
        addressSpaceSize: 1024,
        pcAddress: 0,
        changedAddresses: [],
        changeRevision: 0,
        ...overrides,
    };
}

function region(): HTMLElement {
    return screen.getByRole("region", { name: "Memory" });
}

/** Gives the rows viewport a height and lets the table measure it. */
function setViewportHeight(height: number) {
    Object.defineProperty(region(), "clientHeight", { configurable: true, value: height });
    act(() => {
        for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
    });
}

/**
 * Makes the scroll region follow Chrome's rules for a display:none scroller
 * (a hidden tab panel): while its clientHeight is 0, scrollTop reads 0 and
 * writes to it are dropped; showing it again restores the last position.
 */
function emulateHiddenScroller() {
    const element = region();
    let position = element.scrollTop;
    Object.defineProperty(element, "scrollTop", {
        configurable: true,
        get: () => (element.clientHeight === 0 ? 0 : position),
        set: (value: number) => {
            if (element.clientHeight !== 0) position = value;
        },
    });
}

function userScrollsTo(top: number) {
    region().scrollTop = top;
    fireEvent.scroll(region());
}

function renderedRowAddresses(): number[] {
    return [...region().querySelectorAll<HTMLElement>("tr[data-memory-address]")]
        .map((row) => Number(row.dataset.memoryAddress));
}

function byteCell(address: number): HTMLElement | null {
    return region().querySelector<HTMLElement>(`td[data-address="${address}"]`);
}

/** The element showing a byte's value, which carries the write effect. */
function byteValue(address: number): HTMLElement {
    const cell = byteCell(address);
    if (!cell) throw new Error(`byte ${address} is not rendered`);
    return cell.querySelector<HTMLElement>("[data-byte-value]")!;
}

function isPcMarked(address: number): boolean {
    return byteCell(address)?.getAttribute("aria-current") === "location";
}

describe("MemoryTable viewport", () => {
    it("centres the PC row in the viewport", () => {
        render(<MemoryTable {...props({ pcAddress: 0x200 })} />);
        setViewportHeight(300);

        // Row 32 (0x200) is 960..990px; its middle 975 sits at 150px of a 300px viewport.
        expect(region().scrollTop).toBe(825);
        expect(renderedRowAddresses()).toContain(0x200);
        expect(isPcMarked(0x200)).toBe(true);
    });

    it("keeps address 0 as the first row when the PC is near the start", () => {
        render(<MemoryTable {...props({ pcAddress: 0x40 })} />);
        setViewportHeight(300);

        expect(region().scrollTop).toBe(0);
        expect(renderedRowAddresses()[0]).toBe(0);
    });

    it("keeps the last row at the bottom when the PC is near the end", () => {
        render(<MemoryTable {...props({ pcAddress: 0x3F5 })} />);
        setViewportHeight(300);

        // 64 rows * 30px = 1920px; the last row ends at the viewport bottom at 1920 - 300.
        expect(region().scrollTop).toBe(1620);
        expect(renderedRowAddresses().at(-1)).toBe(0x3F0);
    });

    it("re-centres when the PC changes, overriding a manual scroll", () => {
        const { rerender } = render(<MemoryTable {...props({ pcAddress: 0x200, changeRevision: 1 })} />);
        setViewportHeight(300);

        userScrollsTo(0);
        rerender(<MemoryTable {...props({ pcAddress: 0x300, changeRevision: 2 })} />);

        // Row 48: 48 * 30 + 15 - 150 = 1305.
        expect(region().scrollTop).toBe(1305);
    });

    it("re-centres on a new execution update even when the PC did not move", () => {
        const { rerender } = render(<MemoryTable {...props({ pcAddress: 0x200, pcScrollRevision: 1 })} />);
        setViewportHeight(300);

        userScrollsTo(0);
        rerender(<MemoryTable {...props({ pcAddress: 0x200, pcScrollRevision: 2 })} />);

        expect(region().scrollTop).toBe(825);
    });

    it("leaves a manual scroll alone between execution updates and renders the rows scrolled to", () => {
        render(<MemoryTable {...props({ pcAddress: 0x200 })} />);
        setViewportHeight(300);

        userScrollsTo(1500);

        expect(region().scrollTop).toBe(1500);
        // 1500 / 30 = row 50 (0x320) is the first visible row; 1800 / 30 = row 60 (0x3C0) the last one.
        expect(renderedRowAddresses()).toEqual(expect.arrayContaining([0x320, 0x3B0]));
    });

    it("re-centres for a different viewport height", () => {
        render(<MemoryTable {...props({ pcAddress: 0x200 })} />);
        setViewportHeight(300);
        setViewportHeight(600);

        // 975 - 300 = 675.
        expect(region().scrollTop).toBe(675);
    });

    it("ignores a zero-height viewport, as when its tab is hidden", () => {
        render(<MemoryTable {...props({ pcAddress: 0x200 })} />);
        setViewportHeight(300);
        userScrollsTo(1500);

        setViewportHeight(0);

        expect(region().scrollTop).toBe(1500);
    });

    it("re-centres when its tab is shown again after the PC moved while it was hidden", () => {
        const { rerender } = render(<MemoryTable {...props({ pcAddress: 0x200, pcScrollRevision: 1 })} />);
        emulateHiddenScroller();
        setViewportHeight(300);
        expect(region().scrollTop).toBe(825);

        setViewportHeight(0);
        rerender(<MemoryTable {...props({ pcAddress: 0x300, pcScrollRevision: 2 })} />);
        setViewportHeight(300);

        // Row 48: 48 * 30 + 15 - 150 = 1305.
        expect(region().scrollTop).toBe(1305);
    });

    it("keeps a manual scroll across hiding and showing its tab when no update arrived", () => {
        render(<MemoryTable {...props({ pcAddress: 0x200 })} />);
        emulateHiddenScroller();
        setViewportHeight(300);
        userScrollsTo(1500);

        setViewportHeight(0);
        setViewportHeight(300);

        expect(region().scrollTop).toBe(1500);
    });

    it("renders only the rows around the PC of a 1 MiB address space", () => {
        render(<MemoryTable {...props({ addressSpaceSize: 1 << 20, pcAddress: 0x80000 })} />);
        setViewportHeight(300);

        // Row 32768: 32768 * 30 + 15 - 150 = 982905.
        expect(region().scrollTop).toBe(982905);
        // A browser fires a scroll event for that jump; jsdom does not, so fire it.
        fireEvent.scroll(region());
        expect(renderedRowAddresses()).toContain(0x80000);
        expect(renderedRowAddresses().length).toBeLessThan(40);
        expect(byteCell(0)).toBeNull();
    });

    it("keeps the full scroll height of the address space", () => {
        render(<MemoryTable {...props({ addressSpaceSize: 1024, pcAddress: 0x200 })} />);
        setViewportHeight(300);

        // Spacer rows stand in for the rows that are not rendered: 64 rows * 30px in total.
        const spacers = [...region().querySelectorAll<HTMLElement>("tr[data-memory-spacer]")];
        const spacerHeight = spacers.reduce((sum, row) => sum + parseFloat(row.style.height), 0);
        expect(spacerHeight + renderedRowAddresses().length * ROW).toBe(1920);
    });

    it("never renders or marks addresses outside the address space", () => {
        render(<MemoryTable {...props({
            addressSpaceSize: 1000,
            pcAddress: 999,
            changedAddresses: [998, 999, 1000, 1001],
            changeRevision: 1,
        })} />);
        setViewportHeight(300);

        // 1000 bytes: the last row starts at 992 and holds 992..999.
        expect(renderedRowAddresses().at(-1)).toBe(992);
        expect(byteCell(999)).not.toBeNull();
        expect(byteCell(1000)).toBeNull();
        expect(region().querySelectorAll("td[data-address]").length % 16).toBe(8);
        expect(byteValue(999).dataset.write).toBe("latest");
    });

    it("does not highlight a PC outside the address space", () => {
        render(<MemoryTable {...props({ addressSpaceSize: 1024, pcAddress: 1024 })} />);
        setViewportHeight(300);

        expect(region().querySelector('[aria-current="location"]')).toBeNull();
        expect(region().scrollTop).toBe(0);
    });
});

describe("MemoryTable write effects", () => {
    it("marks every byte of a multi-byte write and no other byte", () => {
        render(<MemoryTable {...props({
            memory: new Map([[0x10, 0x12], [0x11, 0x34], [0x12, 0x56]]),
            changedAddresses: [0x10, 0x11, 0x12],
            changeRevision: 1,
        })} />);

        for (const address of [0x10, 0x11, 0x12]) {
            expect(byteValue(address).dataset.write).toBe("latest");
            expect(byteValue(address).className).toContain("sim-value-change");
        }
        expect(byteValue(0x0F).dataset.write).toBeUndefined();
        expect(byteValue(0x13).dataset.write).toBeUndefined();
    });

    it("replays the effect when the same byte is written again with the same value", () => {
        const memory = new Map([[0x10, 0xAA]]);
        const { rerender } = render(<MemoryTable {...props({ memory, changedAddresses: [0x10], changeRevision: 1 })} />);
        const first = byteValue(0x10);

        rerender(<MemoryTable {...props({ memory: new Map(memory), changedAddresses: [0x10], changeRevision: 2 })} />);

        // A new element restarts the CSS animation from its first frame.
        expect(byteValue(0x10)).not.toBe(first);
        expect(byteValue(0x10).dataset.write).toBe("latest");
        expect(byteValue(0x10).textContent).toBe("AA");
    });

    it("lets the previous update's effects finish while a new update marks its own bytes", () => {
        const { rerender } = render(<MemoryTable {...props({ changedAddresses: [0x10, 0x11], changeRevision: 1 })} />);
        const settling = byteValue(0x10);
        const rewritten = byteValue(0x11);

        rerender(<MemoryTable {...props({ changedAddresses: [0x11, 0x12], changeRevision: 2 })} />);

        expect(byteValue(0x10)).toBe(settling);
        expect(byteValue(0x10).dataset.write).toBe("settling");
        expect(byteValue(0x11)).not.toBe(rewritten);
        expect(byteValue(0x11).dataset.write).toBe("latest");
        expect(byteValue(0x12).dataset.write).toBe("latest");

        rerender(<MemoryTable {...props({ changedAddresses: [], changeRevision: 3 })} />);

        expect(byteValue(0x10).dataset.write).toBeUndefined();
        expect(byteValue(0x11).dataset.write).toBe("settling");
        expect(byteValue(0x12).dataset.write).toBe("settling");
    });

    it("keeps the latest writes marked after the parent clears its list, until the next update", () => {
        // EditorPage empties changedMemory 720ms after an update without a new revision;
        // the reduced-motion indicator relies on the mark outliving that.
        const { rerender } = render(<MemoryTable {...props({ changedAddresses: [0x10], changeRevision: 1 })} />);

        rerender(<MemoryTable {...props({ changedAddresses: [], changeRevision: 1 })} />);

        expect(byteValue(0x10).dataset.write).toBe("latest");
    });

    it("keeps the PC marker on the cell, apart from the write effect on its value", () => {
        render(<MemoryTable {...props({ pcAddress: 0x10, changedAddresses: [0x10, 0x11], changeRevision: 1 })} />);

        expect(isPcMarked(0x10)).toBe(true);
        expect(byteCell(0x10)!.className).toContain("sim-pc-cell");
        expect(byteValue(0x10).dataset.write).toBe("latest");

        expect(isPcMarked(0x11)).toBe(false);
        expect(byteCell(0x11)!.className).not.toContain("sim-pc-cell");
        expect(byteValue(0x11).dataset.write).toBe("latest");
    });
});

describe("MemoryTable sizing", () => {
    // jsdom cannot compute sizes, so these check the layout rules the browser applies.
    it("fills its container and spreads the byte columns over the table width", () => {
        const { container } = render(<MemoryTable {...props()} />);

        const root = container.firstElementChild as HTMLElement;
        expect(root.className).toMatch(/\bflex-1\b/);
        expect(root.className).toMatch(/\bw-full\b/);
        expect(root.className).toMatch(/\bmin-h-0\b/);

        const table = screen.getByRole("table");
        expect(table.className).toMatch(/\bw-full\b/);
        expect(table.className).toMatch(/\btable-fixed\b/);
    });

    it("gives every byte cell 5px of vertical padding", () => {
        render(<MemoryTable {...props()} />);

        const cells = region().querySelectorAll<HTMLElement>("td[data-address]");
        expect(cells.length).toBeGreaterThan(0);
        for (const cell of cells) expect(cell.className).toMatch(/(^|\s)py-\[5px\](\s|$)/);
    });
});
