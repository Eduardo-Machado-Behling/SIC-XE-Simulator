import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EditorPage from "@/components/EditorPage";
import type { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import type { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";

// The simulator talks to the backend over a WebSocket; this fake stands in for
// it, so each test decides what a run, a step or a reset returns.
const fake = vi.hoisted(() => ({
    loadProject: vi.fn(),
    setFile: vi.fn(),
    loadFile: vi.fn(),
    step: vi.fn(),
    reset: vi.fn(),
    clearMemory: vi.fn(),
    resolve: vi.fn(),
}));

vi.mock("@/lib/simulator/Simulator", () => ({
    Simulator: { get: () => fake },
}));

// Monaco and xterm need a real browser; the page wiring under test does not use them.
vi.mock("@/components/CodeEditor", () => ({ CodeEditor: () => null }));
// The console mock keeps the page's command handler, so tests can type commands.
const consoleProps = vi.hoisted(() => ({
    onCommand: null as null | ((command: string, handle: { write: (text: string) => void; clear: () => void }) => void),
}));
vi.mock("@/components/Console", () => ({
    Console: (props: { onCommand?: typeof consoleProps.onCommand }) => {
        consoleProps.onCommand = props.onCommand ?? null;
        return null;
    },
}));

const ARCH: ArchitectureInfo = {
    name: "SIC/XE",
    description: "SIC/XE architecture",
    memory: { address_space_size: 1 << 10, address_width: 4, word_size: 3, alignment: 1, endianness: "big" },
    registers: [{ id: 0, name: "A", description: "Accumulator", width: 3, type: "special_purpose" }],
    instructions: [],
};

function assembled(...names: string[]): ExecutionEvent[] {
    return [{
        type: "ProgramAssembled",
        details: { symbols: names.map((name, index) => ({ name, value: 0x1000 + 3 * index })) },
    }];
}

function simulatorCalls(): number {
    return Object.values(fake).reduce((total, fn) => total + fn.mock.calls.length, 0);
}

async function openPage() {
    const user = userEvent.setup();
    render(<EditorPage projectId="demo" />);
    await screen.findByRole("button", { name: "Run" });
    return user;
}

// Run is a toggle: after a run the button reads Stop.
async function run(user: ReturnType<typeof userEvent.setup>) {
    const stop = screen.queryByRole("button", { name: "Stop" });
    if (stop) await user.click(stop);
    await user.click(screen.getByRole("button", { name: "Run" }));
    await screen.findByRole("button", { name: "Stop" }).catch(() => undefined);
}

function assemblerPanel(): HTMLElement {
    return screen.getByRole("tabpanel", { name: "Assembler" });
}

describe("EditorPage symbol table", () => {
    beforeEach(() => {
        fake.loadProject.mockResolvedValue({
            project: { id: "demo", name: "Demo", architecture: "SIC/XE", files: { "main.asm": "FIRST START 1000" } },
            arch: ARCH,
        });
        fake.setFile.mockResolvedValue(undefined);
        fake.step.mockResolvedValue([]);
        fake.reset.mockResolvedValue([]);
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        for (const fn of Object.values(fake)) fn.mockReset();
    });

    it("shows the symbols of a run, keeps them across a step and replaces them on reassembly", async () => {
        const user = await openPage();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        expect(within(assemblerPanel()).getByRole("status").textContent).toMatch(/no symbol table/i);

        fake.loadFile.mockResolvedValueOnce(assembled("FIRST", "LOOP"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("LOOP")).toBeTruthy();
        expect(fake.setFile).toHaveBeenCalledWith("main.asm", "FIRST START 1000");
        expect(fake.loadFile).toHaveBeenCalledWith("main.asm");

        await user.click(screen.getByRole("button", { name: "Step" }));
        expect(fake.step).toHaveBeenCalledTimes(1);
        expect(within(assemblerPanel()).getByText("LOOP")).toBeTruthy();

        fake.loadFile.mockResolvedValueOnce(assembled("AGAIN"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("AGAIN")).toBeTruthy();
        expect(within(assemblerPanel()).queryByText("LOOP")).toBeNull();
    });

    it("clears the symbols when a later run fails, instead of showing the previous program's", async () => {
        const user = await openPage();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        fake.loadFile.mockResolvedValueOnce(assembled("FIRST"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("FIRST")).toBeTruthy();

        fake.loadFile.mockRejectedValueOnce(new Error("assembly failed"));
        await user.click(screen.getByRole("button", { name: "Stop" }));
        await user.click(screen.getByRole("button", { name: "Run" }));

        await within(assemblerPanel()).findByRole("status");
        expect(within(assemblerPanel()).queryByText("FIRST")).toBeNull();
    });

    it("shows no symbols after a run whose events carry no symbol table", async () => {
        const user = await openPage();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        fake.loadFile.mockResolvedValueOnce(assembled("FIRST"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("FIRST")).toBeTruthy();

        fake.loadFile.mockResolvedValueOnce([]);
        await run(user);
        await within(assemblerPanel()).findByRole("status");
        expect(within(assemblerPanel()).queryByText("FIRST")).toBeNull();
    });

    it("clears the symbols when another project is loaded", async () => {
        const user = userEvent.setup();
        const { rerender } = render(<EditorPage projectId="demo" />);
        await screen.findByRole("button", { name: "Run" });
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        fake.loadFile.mockResolvedValueOnce(assembled("FIRST"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("FIRST")).toBeTruthy();

        rerender(<EditorPage projectId="other" />);

        await within(assemblerPanel()).findByRole("status");
        expect(fake.loadProject).toHaveBeenLastCalledWith("other");
        expect(within(assemblerPanel()).queryByText("FIRST")).toBeNull();
    });

    it("does not call the simulator when switching tabs", async () => {
        const user = await openPage();
        fake.loadFile.mockResolvedValueOnce(assembled("FIRST"));
        await run(user);

        const before = simulatorCalls();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        await user.click(screen.getByRole("tab", { name: "CPU" }));
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        expect(simulatorCalls()).toBe(before);
    });
});

// The memory view's tests need the real event application, not the fake's no-op.
async function useRealResolve() {
    const actual = await vi.importActual<typeof import("@/lib/simulator/Simulator")>("@/lib/simulator/Simulator");
    fake.resolve.mockImplementation(actual.Simulator.prototype.resolve);
}

const memoryWrite = (address: number, bytes: number[]): ExecutionEvent => ({
    type: "MemoryWrite", address, bytes, value: 0, old_bytes: bytes.map(() => 0), old_value: 0,
});
const registerWrite = (name: string, bytes: number[], value: number): ExecutionEvent => ({
    type: "RegisterWrite", name, bytes, value, old_bytes: bytes.map(() => 0), old_value: 0,
});
const MEMORY_CLEARED: ExecutionEvent = { type: "MemoryCleared" };

function cpuPanel(): HTMLElement {
    return screen.getByRole("tabpanel", { name: "CPU" });
}

describe("EditorPage memory clear", () => {
    beforeEach(async () => {
        fake.loadProject.mockResolvedValue({
            project: { id: "demo", name: "Demo", architecture: "SIC/XE", files: { "main.asm": "FIRST START 0" } },
            arch: ARCH,
        });
        fake.setFile.mockResolvedValue(undefined);
        fake.step.mockResolvedValue([]);
        fake.reset.mockResolvedValue([]);
        fake.clearMemory.mockResolvedValue([MEMORY_CLEARED]);
        await useRealResolve();
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        for (const fn of Object.values(fake)) fn.mockReset();
        consoleProps.onCommand = null;
    });

    it("the Clear button sends the command and empties the memory view; registers, PC and symbols stay", async () => {
        const user = await openPage();
        fake.loadFile.mockResolvedValueOnce([
            MEMORY_CLEARED,
            memoryWrite(0, [0xAB, 0xCD]),
            registerWrite("A", [0x12, 0x34, 0x56], 0x123456),
            ...assembled("FIRST"),
        ]);
        await run(user);
        expect(within(cpuPanel()).getByText("AB")).toBeTruthy();

        // One instruction at 3: the PC marker moves to 6 once its animation ends.
        fake.step.mockResolvedValueOnce([{ type: "InstructionFetched", address: 3, bytes: [0, 0, 0], value: 0 }]);
        await user.click(screen.getByRole("button", { name: "Step" }));
        await within(cpuPanel()).findByLabelText("Program counter: 6", {}, { timeout: 3000 });

        await user.click(screen.getByRole("button", { name: "Clear" }));

        expect(fake.clearMemory).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(within(cpuPanel()).queryByText("AB")).toBeNull());
        expect(within(cpuPanel()).queryByText("CD")).toBeNull();
        expect(within(cpuPanel()).getByText("0x123456")).toBeTruthy();
        expect(within(cpuPanel()).getByLabelText("Program counter: 6")).toBeTruthy();
        expect(fake.loadFile).toHaveBeenCalledTimes(1);
        expect(fake.reset).not.toHaveBeenCalled();

        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        expect(within(assemblerPanel()).getByText("FIRST")).toBeTruthy();
    });

    it("a clear drops the changed and consumed memory marks at once", async () => {
        const user = await openPage();
        fake.loadFile.mockResolvedValueOnce([MEMORY_CLEARED, memoryWrite(0, [0xAB])]);
        await run(user);
        fake.step.mockResolvedValueOnce([
            { type: "InstructionFetched", address: 0x10, bytes: [0x0C, 0, 0x20], value: 0x0C0020 },
            memoryWrite(0x20, [0x77]),
        ]);
        await user.click(screen.getByRole("button", { name: "Step" }));
        // Both marks last 720ms after an update; the clear comes well before.
        await vi.waitFor(() => expect(cpuPanel().querySelector(".sim-instruction-consume")).not.toBeNull());
        expect(cpuPanel().querySelector(".sim-value-change")).not.toBeNull();

        await user.click(screen.getByRole("button", { name: "Clear" }));

        await vi.waitFor(() => expect(fake.clearMemory).toHaveBeenCalledTimes(1));
        expect(cpuPanel().querySelector(".sim-instruction-consume")).toBeNull();
        expect(cpuPanel().querySelector(".sim-value-change")).toBeNull();
    });

    it("Run after a previous program shows no stale bytes", async () => {
        const user = await openPage();
        fake.loadFile.mockResolvedValueOnce([MEMORY_CLEARED, memoryWrite(0, [0xAB, 0xCD])]);
        await run(user);
        expect(within(cpuPanel()).getByText("AB")).toBeTruthy();

        fake.loadFile.mockResolvedValueOnce([MEMORY_CLEARED, memoryWrite(0x10, [0xEF])]);
        await run(user);

        await within(cpuPanel()).findByText("EF");
        expect(within(cpuPanel()).queryByText("AB")).toBeNull();
        expect(within(cpuPanel()).queryByText("CD")).toBeNull();
    });

    it("the command palette has a Clear Memory entry", async () => {
        const user = await openPage();
        fake.loadFile.mockResolvedValueOnce([MEMORY_CLEARED, memoryWrite(0, [0xAB])]);
        await run(user);

        await user.keyboard("{Control>}{Shift>}P{/Shift}{/Control}");
        await user.click(await screen.findByRole("option", { name: "Clear Memory" }));

        expect(fake.clearMemory).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(within(cpuPanel()).queryByText("AB")).toBeNull());
    });

    it("the console's clearmem clears the memory, while clear still only clears the terminal", async () => {
        await openPage();
        const handle = { write: vi.fn(), clear: vi.fn() };

        act(() => consoleProps.onCommand?.("clear", handle));
        expect(handle.clear).toHaveBeenCalledTimes(1);
        expect(fake.clearMemory).not.toHaveBeenCalled();

        await act(async () => consoleProps.onCommand?.("clearmem", handle));
        expect(fake.clearMemory).toHaveBeenCalledTimes(1);
        expect(handle.clear).toHaveBeenCalledTimes(1);

        act(() => consoleProps.onCommand?.("help", handle));
        const help = handle.write.mock.calls.map(([text]) => text).join("");
        expect(help).toMatch(/clearmem\s+Clear the memory/);
        expect(help).toMatch(/clear\s+Clear the terminal/);
    });
});
