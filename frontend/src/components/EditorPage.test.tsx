import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EditorPage from "@/components/EditorPage";
import type { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import type { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import { SimulatorCommandError } from "@/lib/transport/SimulatorTransport";

// The simulator talks to the backend over a WebSocket; this fake stands in for
// it, so each test decides what a run, a step or a reset returns.
const fake = vi.hoisted(() => ({
    loadProject: vi.fn(),
    setFile: vi.fn(),
    loadFile: vi.fn(),
    step: vi.fn(),
    reset: vi.fn(),
    clear: vi.fn(),
    resolve: vi.fn(),
}));

vi.mock("@/lib/simulator/Simulator", () => ({
    Simulator: { get: () => fake },
}));

// Monaco and xterm need a real browser; the page wiring under test does not use them.
vi.mock("@/components/CodeEditor", () => ({ CodeEditor: () => null }));
vi.mock("@/components/Console", () => ({ Console: () => null }));

const ARCH: ArchitectureInfo = {
    name: "SIC/XE",
    description: "SIC/XE architecture",
    memory: { address_space_size: 1 << 10, address_width: 4, word_size: 3, alignment: 1, endianness: "big" },
    registers: [{ id: 0, name: "A", description: "Accumulator", width: 3, type: "special_purpose" }],
    instructions: [],
};

// One "<name>  RSUB" statement per name, each defining that name.
function assembled(...names: string[]): ExecutionEvent[] {
    return [{
        type: "ProgramAssembled",
        details: {
            symbols: names.map((name, index) => ({ name, value: 0x1000 + 3 * index })),
            program: { name: "DEMO", start: 0x1000, length: 3 * names.length, entry: 0x1000 },
            listing: names.map((name, index) => ({
                line: index + 1,
                address: 0x1000 + 3 * index,
                bytes: [0x4F, 0x00, 0x00],
                source: `${name}  RSUB`,
            })),
            relocations: [],
            diagnostics: [],
        },
    }];
}

// The listing row of a statement made by assembled().
function listed(name: string): HTMLElement | null {
    return within(assemblerPanel()).queryByText(`${name} RSUB`);
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

describe("EditorPage assembly report", () => {
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

    it("shows the report of a run, keeps it across a step and replaces it on reassembly", async () => {
        const user = await openPage();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        expect(within(assemblerPanel()).getByRole("status").textContent).toMatch(/no assembly report/i);

        fake.loadFile.mockResolvedValueOnce(assembled("FIRST", "LOOP"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("LOOP")).toBeTruthy();
        expect(listed("LOOP")).toBeTruthy();
        expect(fake.setFile).toHaveBeenCalledWith("main.asm", "FIRST START 1000");
        expect(fake.loadFile).toHaveBeenCalledWith("main.asm");

        await user.click(screen.getByRole("button", { name: "Step" }));
        expect(fake.step).toHaveBeenCalledTimes(1);
        expect(within(assemblerPanel()).getByText("LOOP")).toBeTruthy();

        fake.loadFile.mockResolvedValueOnce(assembled("AGAIN"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("AGAIN")).toBeTruthy();
        expect(within(assemblerPanel()).queryByText("LOOP")).toBeNull();
        expect(listed("LOOP")).toBeNull();
    });

    it("clears the report when a later run fails, instead of showing the previous program's", async () => {
        const user = await openPage();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        fake.loadFile.mockResolvedValueOnce(assembled("FIRST"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("FIRST")).toBeTruthy();

        // As the backend replies to a load whose source does not assemble: the
        // load cleared the previous program before the assembly failed.
        fake.loadFile.mockRejectedValueOnce(new SimulatorCommandError(
            { type: "invalid-request", status: 400, title: "Invalid request", detail: "assembly failed" },
            [{ type: "MemoryCleared" }, { type: "ProgramCleared" }],
        ));
        await user.click(screen.getByRole("button", { name: "Stop" }));
        await user.click(screen.getByRole("button", { name: "Run" }));

        await within(assemblerPanel()).findByRole("status");
        expect(within(assemblerPanel()).queryByText("FIRST")).toBeNull();
        expect(listed("FIRST")).toBeNull();
    });

    it("shows no report after a run whose events carry none, as for a hex dump", async () => {
        const user = await openPage();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        fake.loadFile.mockResolvedValueOnce(assembled("FIRST"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("FIRST")).toBeTruthy();

        fake.loadFile.mockResolvedValueOnce([]);
        await run(user);
        await within(assemblerPanel()).findByRole("status");
        expect(within(assemblerPanel()).queryByText("FIRST")).toBeNull();
        expect(listed("FIRST")).toBeNull();
    });

    it("clears the report when another project is loaded", async () => {
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
        expect(listed("FIRST")).toBeNull();
    });

    it("clears the report when the machine is cleared", async () => {
        const user = await openPage();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        fake.loadFile.mockResolvedValueOnce(assembled("FIRST"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("FIRST")).toBeTruthy();

        fake.clear.mockResolvedValueOnce([{ type: "MemoryCleared" }, { type: "ProgramCleared" }]);
        await user.click(screen.getByRole("button", { name: "Clear" }));

        await within(assemblerPanel()).findByRole("status");
        expect(fake.clear).toHaveBeenCalledTimes(1);
        expect(within(assemblerPanel()).queryByText("FIRST")).toBeNull();
        expect(listed("FIRST")).toBeNull();
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
