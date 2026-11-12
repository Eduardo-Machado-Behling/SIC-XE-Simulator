import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EditorPage from "@/components/EditorPage";
import type { CodeEditorProps } from "@/components/CodeEditor";
import type { ConsoleHandle, ConsoleProps } from "@/components/Console";
import demoPayload from "@/lib/simulator/__fixtures__/macros-demo.json";
import type { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import type { ExecutionEvent, MacroReport } from "@/lib/simulator/ExecutionEvent";
import { SimulatorCommandError } from "@/lib/transport/SimulatorTransport";

// The page with its backends faked: the simulator, the project store and the
// language service. Nothing here opens a socket or a request.
const fake = vi.hoisted(() => ({
    loadProject: vi.fn(),
    loadFile: vi.fn(),
    step: vi.fn(),
    reset: vi.fn(),
    clear: vi.fn(),
    resolve: vi.fn(),
}));

// Every call the page makes on the console handle, in order.
const consoleCalls = vi.hoisted(() => [] as unknown[][]);

// The last props each editor (by path) was rendered with.
const editors = vi.hoisted(() => new Map<string, unknown>());

// The files of the stored project the page opens. A test may replace them.
const ONE_FILE = { "main.asm": "PROG START 0" };
const stored = vi.hoisted(() => ({ files: {} as Record<string, string> }));

vi.mock("@/lib/simulator/Simulator", () => ({
    Simulator: { get: () => fake },
}));

vi.mock("@/lib/simulator/ProjectSessionSync", () => ({
    getStoredProject: () => ({ id: "demo", name: "Demo", architecture: "SIC/XE", files: stored.files }),
    saveStoredProject: () => [],
    syncProjectToSession: async () => "session",
}));

vi.mock("@/lib/language/LanguageClient", () => ({
    AssemblerLanguageClient: class {
        saveDocument = async () => {};
        onCatalog = () => () => {};
        dispose() {}
    },
}));

// Monaco and xterm need a real browser. The editor keeps its header actions,
// where the Show/Hide MASMAPRG.ASM toggle lives.
vi.mock("@/components/CodeEditor", () => ({
    CodeEditor: (props: CodeEditorProps) => {
        editors.set(props.path, props);
        return <div>{props.headerActions}</div>;
    },
}));

vi.mock("@/components/Console", () => ({
    Console: ({ handleRef }: ConsoleProps) => {
        const handle: ConsoleHandle = {
            write: (text) => { consoleCalls.push(["write", text]); },
            log: (text, level) => { consoleCalls.push(["log", text, level]); },
            writeEvents: (events) => { consoleCalls.push(["writeEvents", events]); },
            clear: () => { consoleCalls.push(["clear"]); },
        };
        if (handleRef) handleRef.current = handle;
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

const demo = demoPayload as unknown as MacroReport;

function expanded(details: MacroReport): ExecutionEvent {
    return { type: "MacrosExpanded", details };
}

// A lone MCEND: the processor stops before any definition.
const loneMcend: MacroReport = {
    ...demo,
    ok: false,
    hasMacros: false,
    text: "        MCEND",
    names: [],
    definitions: [],
    expansions: [],
    lineMap: [],
    trace: { truncated: false, steps: [] },
    diagnostics: [{ severity: "error", line: 1, column: 9, length: 5, message: "MCEND without MCDEFN" }],
};

function editorProps(path: string): CodeEditorProps {
    return editors.get(path) as CodeEditorProps;
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

function expansionTable(): HTMLElement {
    return screen.getByRole("table", { name: "Macro expansion table" });
}

describe("EditorPage with the macro processor", () => {
    beforeEach(() => {
        stored.files = ONE_FILE;
        fake.loadProject.mockResolvedValue({
            project: { id: "demo", name: "Demo", architecture: "SIC/XE", files: {} },
            arch: ARCH,
        });
        fake.step.mockResolvedValue([]);
        fake.reset.mockResolvedValue([]);
        fake.clear.mockResolvedValue([]);
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        for (const fn of Object.values(fake)) fn.mockReset();
        consoleCalls.length = 0;
        editors.clear();
        localStorage.clear();
    });

    describe("a click on an expansion (F3)", () => {
        it("marks that expansion in both editors and in its row, until the next Run", async () => {
            const user = await openPage();
            fake.loadFile.mockResolvedValueOnce([expanded(demo)]);
            await run(user);
            await user.click(screen.getByRole("tab", { name: "Macros" }));
            expect(within(expansionTable()).queryAllByRole("row", { selected: true })).toHaveLength(0);
            expect(editorProps("MASMAPRG.ASM").selectedLines).toBeNull();

            // SOMA #002 runs inside DOBRA #001, which is called on source line 30.
            await user.click(within(expansionTable()).getByText("002").closest("tr")!);
            const [selected] = within(expansionTable()).getAllByRole("row", { selected: true });
            expect(within(selected).getByText("002")).toBeTruthy();
            expect(editorProps("MASMAPRG.ASM").selectedLines).toEqual({ from: 4, to: 7 });
            expect(editorProps("main.asm").selectedLines).toEqual({ from: 30, to: 30 });

            await user.click(within(expansionTable()).getByText("003").closest("tr")!);
            expect(editorProps("MASMAPRG.ASM").selectedLines).toEqual({ from: 8, to: 13 });
            expect(editorProps("main.asm").selectedLines).toEqual({ from: 31, to: 31 });

            fake.loadFile.mockResolvedValueOnce([expanded({ ...demo })]);
            await run(user);
            expect(within(expansionTable()).queryAllByRole("row", { selected: true })).toHaveLength(0);
            expect(editorProps("MASMAPRG.ASM").selectedLines).toBeNull();
            expect(editorProps("main.asm").selectedLines).toBeNull();
        });

        it("is dropped by Clear", async () => {
            const user = await openPage();
            fake.loadFile.mockResolvedValueOnce([expanded(demo)]);
            await run(user);
            await user.click(screen.getByRole("tab", { name: "Macros" }));
            await user.click(within(expansionTable()).getByText("001").closest("tr")!);
            expect(editorProps("main.asm").selectedLines).toEqual({ from: 30, to: 30 });

            await user.click(screen.getByTitle("Clear memory, assembly data, and registers"));
            expect(editorProps("main.asm").selectedLines).toBeNull();
        });
    });

    describe("a failed Run (F5)", () => {
        it("writes the macro processor's line before the error detail", async () => {
            const user = await openPage();
            fake.loadFile.mockRejectedValueOnce(new SimulatorCommandError(
                { type: "assembly-error", status: 422, title: "Macro processing failed", detail: "1:9: MCEND without MCDEFN" },
                [expanded(loneMcend)],
            ));
            await run(user);

            expect(consoleCalls.slice(1)).toEqual([
                ["writeEvents", [expanded(loneMcend)]],
                ["log", "1:9: MCEND without MCDEFN", "error"],
            ]);
        });

        it("writes the expansion line, and only it, when the assembler fails after the processor", async () => {
            const user = await openPage();
            const cleared: ExecutionEvent = { type: "ProgramCleared" };
            fake.loadFile.mockRejectedValueOnce(new SimulatorCommandError(
                { type: "assembly-error", status: 422, title: "Assembly failed", detail: "5: unknown mnemonic" },
                [expanded(demo), cleared],
            ));
            await run(user);

            expect(consoleCalls.slice(1)).toEqual([
                ["writeEvents", [expanded(demo)]],
                ["log", "5: unknown mnemonic", "error"],
            ]);
        });
    });

    describe("a new folder (F8)", () => {
        it("cannot take the generated file's name at the project root, in any case", async () => {
            const user = await openPage();
            vi.spyOn(window, "prompt").mockReturnValueOnce("masmaprg.asm");
            await user.click(screen.getByRole("button", { name: "New folder in project" }));

            const dialog = await screen.findByRole("alertdialog");
            expect(within(dialog).getByText("Reserved name")).toBeTruthy();
            expect(screen.queryByText("masmaprg.asm")).toBeNull();
        });

        it("can take any other name", async () => {
            const user = await openPage();
            vi.spyOn(window, "prompt").mockReturnValueOnce("lib");
            await user.click(screen.getByRole("button", { name: "New folder in project" }));

            expect(await screen.findByText("lib")).toBeTruthy();
            expect(screen.queryByRole("alertdialog")).toBeNull();
        });
    });

    describe("the file Run assembles", () => {
        // Both have a START, and macro.asm sorts first.
        const TWO_FILES = { "macro.asm": "MAC START 0", "main.asm": "PROG START 0" };

        it("is main.asm, the file a project with main.asm and macro.asm opens on", async () => {
            stored.files = TWO_FILES;
            const user = await openPage();
            expect([...editors.keys()]).toEqual(["main.asm"]);

            fake.loadFile.mockResolvedValueOnce([]);
            await run(user);
            expect(fake.loadFile).toHaveBeenCalledTimes(1);
            expect(fake.loadFile).toHaveBeenLastCalledWith("main.asm");
        });

        it("is the open file, and stays the last one while MASMAPRG.ASM is open", async () => {
            stored.files = TWO_FILES;
            const user = await openPage();
            await user.click(screen.getByTitle("macro.asm"));
            fake.loadFile.mockResolvedValueOnce([expanded(demo)]);
            await run(user);
            expect(fake.loadFile).toHaveBeenLastCalledWith("macro.asm");
            expect(consoleCalls).toContainEqual(["log", "Assembling macro.asm", "info"]);
            expect(consoleCalls).toContainEqual(["log", "Loaded macro.asm", "success"]);
            expect(editorProps("macro.asm").bands).toHaveLength(4);

            // MASMAPRG.ASM open on its own: no split view, so no toggle.
            await user.click(screen.getByTitle("MASMAPRG.ASM"));
            expect(screen.queryByRole("button", { name: "Hide MASMAPRG.ASM" })).toBeNull();
            fake.loadFile.mockResolvedValueOnce([expanded(demo)]);
            await run(user);
            expect(fake.loadFile).toHaveBeenCalledTimes(2);
            expect(fake.loadFile).toHaveBeenLastCalledWith("macro.asm");
            // Run opens the file it assembled, next to MASMAPRG.ASM.
            expect(screen.getByRole("button", { name: "Hide MASMAPRG.ASM" })).toBeTruthy();

            // The same with main.asm, which is not the entry point.
            await user.click(screen.getByTitle("main.asm"));
            fake.loadFile.mockResolvedValueOnce([expanded(demo)]);
            await run(user);
            expect(fake.loadFile).toHaveBeenLastCalledWith("main.asm");
            await user.click(screen.getByTitle("MASMAPRG.ASM"));
            fake.loadFile.mockResolvedValueOnce([expanded(demo)]);
            await run(user);
            expect(fake.loadFile).toHaveBeenCalledTimes(4);
            expect(fake.loadFile).toHaveBeenLastCalledWith("main.asm");
        });
    });

    describe("a stored project without files", () => {
        it("opens with the syntax tour and the macro tour", async () => {
            stored.files = {};
            await openPage();

            expect(screen.getByTitle("main.asm")).toBeTruthy();
            expect(screen.getByTitle("macro.asm")).toBeTruthy();
        });
    });

    describe("accessibility (F9)", () => {
        it("tells whether the MASMAPRG.ASM split view is shown", async () => {
            const user = await openPage();
            fake.loadFile.mockResolvedValueOnce([expanded(demo)]);
            await run(user);

            const hide = screen.getByRole("button", { name: "Hide MASMAPRG.ASM" });
            expect(hide.getAttribute("aria-expanded")).toBe("true");
            await user.click(hide);
            const show = screen.getByRole("button", { name: "Show MASMAPRG.ASM" });
            expect(show.getAttribute("aria-expanded")).toBe("false");
        });

        it("names each expansion row and keeps it focusable", async () => {
            const user = await openPage();
            fake.loadFile.mockResolvedValueOnce([expanded(demo)]);
            await run(user);
            await user.click(screen.getByRole("tab", { name: "Macros" }));

            const row = within(expansionTable()).getByRole("row", { name: "Expansion #001 DOBRA, output lines 3-7" });
            expect(row.tabIndex).toBe(0);
            expect(within(expansionTable()).getByRole("row", { name: "Expansion #004 ESCALA, output line 14" })).toBeTruthy();

            row.focus();
            await user.keyboard("{Enter}");
            expect(row.getAttribute("aria-selected")).toBe("true");
        });
    });
});
