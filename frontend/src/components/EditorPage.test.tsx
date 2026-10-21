import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type MutableRefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import EditorPage, { type EditorSimulator } from "@/components/EditorPage";
import type { ConsoleHandle } from "@/components/Console";
import { SimulatorApiClient } from "@/lib/api/SimulatorApiClient";
import { LocalProjectStore } from "@/lib/projects/LocalProjectStore";
import { ProjectSync } from "@/lib/projects/ProjectSync";
import { createMemorySessionStore } from "@/lib/session/sessionCookie";
import type { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import type { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import type { Project } from "@/lib/simulator/Project";
import { FakeBackend } from "@/test/fakeBackend";

// Monaco and xterm need a real browser; stand-ins keep the page's own logic under test.
vi.mock("@/components/CodeEditor", () => ({
    CodeEditor: ({ path, value }: { path: string; value: string }) => (
        <textarea aria-label={`Editor ${path}`} value={value} readOnly />
    ),
}));

const consoleOutput: string[] = [];
vi.mock("@/components/Console", () => ({
    Console: function FakeConsole({
        onCommand,
        handleRef,
    }: {
        onCommand?: (command: string, handle: ConsoleHandle) => void;
        handleRef?: MutableRefObject<ConsoleHandle | null>;
    }) {
        const handle: ConsoleHandle = { write: (text) => consoleOutput.push(text), clear: () => undefined };
        useEffect(() => {
            if (handleRef) handleRef.current = handle;
        });
        return (
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    const input = event.currentTarget.elements.namedItem("command") as HTMLInputElement;
                    onCommand?.(input.value, handle);
                    input.value = "";
                }}
            >
                <input name="command" aria-label="Console command" />
            </form>
        );
    },
}));

const A = "550e8400-e29b-41d4-a716-446655440000";
const B = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const hello: Project = { id: A, name: "Hello", architecture: "SIC-XE", files: { "main.asm": "LDA #1" } };
const ARCH: ArchitectureInfo = {
    name: "SIC/XE",
    description: "SIC/XE architecture",
    memory: { address_space_size: 1 << 10, address_width: 4, word_size: 3, alignment: 1, endianness: "big" },
    registers: [{ id: 0, name: "A", description: "Accumulator", width: 3, type: "special_purpose" }],
    instructions: [],
};

function setup(simulator: Partial<EditorSimulator>) {
    const backend = new FakeBackend();
    const store = new LocalProjectStore(() => undefined);
    store.put(hello);
    const sync = new ProjectSync({
        api: new SimulatorApiClient({ baseUrl: backend.baseUrl, fetch: backend.fetch }),
        store,
        session: createMemorySessionStore(),
        fileDebounceMs: 0,
    });
    const fake: EditorSimulator = {
        bindProject: vi.fn(async () => ARCH),
        runFile: vi.fn(async (): Promise<ExecutionEvent[]> => []),
        step: vi.fn(async (): Promise<ExecutionEvent[]> => []),
        reset: vi.fn(async (): Promise<ExecutionEvent[]> => []),
        clear: vi.fn(async (): Promise<ExecutionEvent[]> => []),
        resolve: vi.fn(),
        ...simulator,
    };
    const { rerender } = render(<EditorPage projectId={A} sync={sync} simulator={fake} />);
    const show = (projectId: string) => rerender(<EditorPage projectId={projectId} sync={sync} simulator={fake} />);
    return { fake, store, show };
}

// Typed with the input focused directly: in jsdom every panel separator sits at
// (0, 0), so react-resizable-panels cancels the pointerdown of a click on it.
async function consoleCommand(command: string) {
    const user = userEvent.setup();
    screen.getByLabelText("Console command").focus();
    await user.keyboard(`${command}{Enter}`);
}

afterEach(() => {
    consoleOutput.length = 0;
});

describe("EditorPage execution", () => {
    it("refuses Run, Step, Reset and Clear when the architecture could not be loaded, and sends nothing", async () => {
        const { fake } = setup({ bindProject: vi.fn(async () => Promise.reject(new Error("Simulator did not answer"))) });

        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Architecture info unavailable"));
        expect((screen.getByRole("button", { name: /Run/ }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: /Step/ }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: /Reset/ }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: /^Clear$/ }) as HTMLButtonElement).disabled).toBe(true);

        await consoleCommand("run");
        await consoleCommand("step");
        await consoleCommand("reset");
        await consoleCommand("clear machine");

        expect(fake.runFile).not.toHaveBeenCalled();
        expect(fake.step).not.toHaveBeenCalled();
        expect(fake.reset).not.toHaveBeenCalled();
        expect(fake.clear).not.toHaveBeenCalled();
        expect(consoleOutput.join("")).toMatch(/cannot run.*Simulator did not answer/i);
        expect(consoleOutput.join("")).not.toContain("Program finished");
    });

    it("keeps Run disabled while the simulator is still binding the project", async () => {
        const { fake } = setup({ bindProject: vi.fn(() => new Promise<ArchitectureInfo>(() => undefined)) });

        const runButton = (await screen.findByRole("button", { name: /Run/ })) as HTMLButtonElement;
        expect(runButton.disabled).toBe(true);
        expect(runButton.title).toMatch(/still loading/);

        await consoleCommand("run");
        expect(fake.runFile).not.toHaveBeenCalled();
    });

    it("binds the project stored in this browser and runs the active file with its current content", async () => {
        const user = userEvent.setup();
        const { fake, store } = setup({});
        await waitFor(() => expect((screen.getByRole("button", { name: /Run/ }) as HTMLButtonElement).disabled).toBe(false));
        expect(fake.bindProject).toHaveBeenCalledWith(hello);
        store.writeFile(A, "main.asm", "LDA #2");

        await user.click(screen.getByRole("button", { name: /Run/ }));

        await waitFor(() => expect(consoleOutput.join("")).toContain("Program finished."));
        expect(fake.runFile).toHaveBeenCalledWith({ ...hello, files: { "main.asm": "LDA #2" } }, "main.asm");
        expect(consoleOutput.join("").indexOf("Running program")).toBeLessThan(consoleOutput.join("").indexOf("Program finished."));
    });

    it("reports a failed run in the console and the error dialog", async () => {
        const { fake } = setup({ runFile: vi.fn(async () => Promise.reject(new Error("The simulator cannot run \"x\" yet"))) });
        await waitFor(() => expect((screen.getByRole("button", { name: /Run/ }) as HTMLButtonElement).disabled).toBe(false));

        await consoleCommand("run");

        expect((await screen.findByRole("alertdialog")).textContent).toContain("The simulator cannot run \"x\" yet");
        expect(fake.runFile).toHaveBeenCalledTimes(1);
        expect(consoleOutput.join("")).toContain("Run failed");
        expect(consoleOutput.join("")).not.toContain("Program finished");
    });
});

// ------------------------------------------------------------------ symbol table

function assembled(...names: string[]): ExecutionEvent[] {
    return [{
        type: "ProgramAssembled",
        details: { symbols: names.map((name, index) => ({ name, value: 0x1000 + 3 * index })) },
    }];
}

const demoSource = "FIRST START 1000";

function simulatorCalls(fake: EditorSimulator): number {
    return Object.values(fake).reduce((total, fn) => total + vi.mocked(fn).mock.calls.length, 0);
}

async function openPage(simulator: Partial<EditorSimulator> = {}) {
    const user = userEvent.setup();
    const page = setup(simulator);
    page.store.writeFile(A, "main.asm", demoSource);
    await waitFor(() => expect((screen.getByRole("button", { name: "Run" }) as HTMLButtonElement).disabled).toBe(false));
    return { user, ...page };
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
    it("shows the symbols of a run, keeps them across a step and replaces them on reassembly", async () => {
        const { user, fake } = await openPage();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        expect(within(assemblerPanel()).getByRole("status").textContent).toMatch(/no symbol table/i);

        vi.mocked(fake.runFile).mockResolvedValueOnce(assembled("FIRST", "LOOP"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("LOOP")).toBeTruthy();
        expect(fake.runFile).toHaveBeenCalledWith({ ...hello, files: { "main.asm": demoSource } }, "main.asm");

        await user.click(screen.getByRole("button", { name: "Step" }));
        expect(fake.step).toHaveBeenCalledTimes(1);
        expect(within(assemblerPanel()).getByText("LOOP")).toBeTruthy();

        vi.mocked(fake.runFile).mockResolvedValueOnce(assembled("AGAIN"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("AGAIN")).toBeTruthy();
        expect(within(assemblerPanel()).queryByText("LOOP")).toBeNull();
    });

    it("clears the symbols when a later run fails, instead of showing the previous program's", async () => {
        const { user, fake } = await openPage();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        vi.mocked(fake.runFile).mockResolvedValueOnce(assembled("FIRST"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("FIRST")).toBeTruthy();

        vi.mocked(fake.runFile).mockRejectedValueOnce(new Error("assembly failed"));
        await user.click(screen.getByRole("button", { name: "Stop" }));
        await user.click(screen.getByRole("button", { name: "Run" }));

        await within(assemblerPanel()).findByRole("status");
        expect(within(assemblerPanel()).queryByText("FIRST")).toBeNull();
    });

    it("shows no symbols after a run whose events carry no symbol table", async () => {
        const { user, fake } = await openPage();
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        vi.mocked(fake.runFile).mockResolvedValueOnce(assembled("FIRST"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("FIRST")).toBeTruthy();

        vi.mocked(fake.runFile).mockResolvedValueOnce([]);
        await run(user);
        await within(assemblerPanel()).findByRole("status");
        expect(within(assemblerPanel()).queryByText("FIRST")).toBeNull();
    });

    it("clears the symbols when another project is loaded", async () => {
        const { user, fake, store, show } = await openPage();
        const other: Project = { id: B, name: "Other", architecture: "SIC-XE", files: { "main.asm": "" } };
        store.put(other);
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        vi.mocked(fake.runFile).mockResolvedValueOnce(assembled("FIRST"));
        await run(user);
        expect(await within(assemblerPanel()).findByText("FIRST")).toBeTruthy();

        show(B);

        await waitFor(() => expect(fake.bindProject).toHaveBeenLastCalledWith(other));
        await within(assemblerPanel()).findByRole("status");
        expect(within(assemblerPanel()).queryByText("FIRST")).toBeNull();
    });

    it("does not call the simulator when switching tabs", async () => {
        const { user, fake } = await openPage();
        vi.mocked(fake.runFile).mockResolvedValueOnce(assembled("FIRST"));
        await run(user);

        const before = simulatorCalls(fake);
        await user.click(screen.getByRole("tab", { name: "Assembler" }));
        await user.click(screen.getByRole("tab", { name: "CPU" }));
        await user.click(screen.getByRole("tab", { name: "Assembler" }));

        expect(simulatorCalls(fake)).toBe(before);
    });
});
