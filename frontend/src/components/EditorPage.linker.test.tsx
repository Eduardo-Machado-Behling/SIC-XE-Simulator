import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EditorPage from "@/components/EditorPage";
import type { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import { readLinkSettings } from "@/lib/simulator/linkSettings";
import { SimulatorCommandError } from "@/lib/transport/SimulatorTransport";
import { macroReportFixture } from "@/lib/simulator/macroFixtures";

// The simulator talks to the backend over a WebSocket; this fake stands in for it.
const fake = vi.hoisted(() => ({
    loadProject: vi.fn(),
    setFile: vi.fn(),
    loadFile: vi.fn(),
    loadFiles: vi.fn(),
    step: vi.fn(),
    reset: vi.fn(),
    resolve: vi.fn(),
}));

const FILES = vi.hoisted(() => ({
    "main.asm": "PROG    ENTRY 0\n        EXTREF SUBB\n       +JSUB SUBB\n        END\n",
    "sub.asm": "SUBB    START 0\n        RSUB\n        END\n",
}));

vi.mock("@/lib/simulator/Simulator", () => ({
    Simulator: { get: () => fake },
}));

vi.mock("@/lib/simulator/ProjectSessionSync", () => ({
    getStoredProject: (id: string) => ({ id, name: "Linked", architecture: "SIC/XE", files: { ...FILES } }),
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

// Monaco needs a real browser; the stub records the props each editor gets, by path.
const editors = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock("@/components/CodeEditor", () => ({
    CodeEditor: (props: Record<string, unknown>) => { editors.set(String(props.path), props); return null; },
}));
vi.mock("@/components/Console", () => ({ Console: () => null }));

const ARCH: ArchitectureInfo = {
    name: "SIC/XE",
    description: "SIC/XE architecture",
    memory: { address_space_size: 1 << 20, address_width: 4, word_size: 3, alignment: 1, endianness: "big" },
    registers: [{ id: 0, name: "A", description: "Accumulator", width: 3, type: "special_purpose" }],
    instructions: [],
};

// react-resizable-panels claims every pointer-down in jsdom (all boxes are 0x0, so each click
// lands on a resize handle) and the field never gets focus: set its value with a change event.
function typeAddress(text: string) {
    fireEvent.change(screen.getByRole("textbox", { name: "Load address" }), { target: { value: text } });
}

async function openPage() {
    const user = userEvent.setup();
    render(<EditorPage projectId="demo" />);
    await screen.findByRole("button", { name: "Run" });
    return user;
}

describe("EditorPage linking", () => {
    beforeEach(() => {
        localStorage.clear();
        fake.loadProject.mockResolvedValue({
            project: { id: "demo", name: "Linked", architecture: "SIC/XE", files: { ...FILES } },
            arch: ARCH,
        });
        fake.loadFile.mockResolvedValue([]);
        fake.loadFiles.mockResolvedValue([]);
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        for (const fn of Object.values(fake)) fn.mockReset();
    });

    it("runs the open file alone when no file is switched on, as before", async () => {
        const user = await openPage();
        await user.click(screen.getByRole("button", { name: "Run" }));
        await waitFor(() => expect(fake.loadFile).toHaveBeenCalledWith("main.asm"));
        expect(fake.loadFiles).not.toHaveBeenCalled();
    });

    it("links the switched-on files at the load address, the ENTRY file first", async () => {
        const user = await openPage();
        await user.click(await screen.findByRole("switch", { name: "Include sub.asm in the link" }));
        await user.click(screen.getByRole("switch", { name: "Include main.asm in the link" }));
        typeAddress("1000");

        await user.click(screen.getByRole("button", { name: "Run · 2 files" }));
        await waitFor(() => expect(fake.loadFiles).toHaveBeenCalledWith(["main.asm", "sub.asm"], 0x1000));
        expect(fake.loadFile).not.toHaveBeenCalled();
    });

    it("remembers the switches and the address for the project", async () => {
        const user = await openPage();
        await user.click(await screen.findByRole("switch", { name: "Include sub.asm in the link" }));
        typeAddress("200");
        await waitFor(() => expect(readLinkSettings("demo")).toEqual({ linkSet: ["sub.asm"], loadAddress: 0x200 }));
    });

    it("opens a section's file at its first line when its band in the .out is clicked", async () => {
        fake.loadFiles.mockResolvedValueOnce([{
            type: "ProgramLinked",
            details: {
                loadAddress: 0x1000,
                estab: [
                    { section: "PROG", symbol: "", address: 0, length: 4, file: "main.asm" },
                    { section: "SUBB", symbol: "", address: 4, length: 3, file: "sub.asm" },
                ],
                objects: [{ source: "main.asm", text: "H PROG" }, { source: "sub.asm", text: "H SUBB" }],
                out: { name: "PROG", text: "H PROG   000000 000007", bands: [
                    { firstLine: 2, lastLine: 3, label: "main.asm · PROG" },
                    { firstLine: 4, lastLine: 5, label: "sub.asm · SUBB" },
                ] },
                trace: [],
            },
        }]);
        const user = await openPage();
        await user.click(await screen.findByRole("switch", { name: "Include sub.asm in the link" }));
        await user.click(screen.getByRole("switch", { name: "Include main.asm in the link" }));
        await user.click(screen.getByRole("button", { name: "Run · 2 files" }));
        await user.click(await screen.findByRole("tab", { name: "PROG.out" }));

        const out = () => editors.get("PROG.out") as { bands: { hover?: string }[]; onBandClick?: (index: number) => void };
        await waitFor(() => expect(out().bands).toHaveLength(2));
        expect(out().bands[1].hover).toContain("sub.asm");
        expect(out().bands[1].hover).toContain("001004");
        act(() => out().onBandClick?.(1));
        await waitFor(() => expect(editors.get("sub.asm")?.secondaryLine).toBe(1));
    });

    it("shows each file's object program and the linked program beside the editor", async () => {
        fake.loadFiles.mockResolvedValueOnce([{
            type: "ProgramLinked",
            details: {
                loadAddress: 0x1000,
                estab: [],
                objects: [{ source: "main.asm", text: "H PROG" }, { source: "sub.asm", text: "H SUBB" }],
                out: { name: "PROG", text: "H PROG   000000 00000B", bands: [{ firstLine: 2, lastLine: 3, label: "main.asm · PROG" }] },
                trace: [],
            },
        }]);
        const user = await openPage();
        await user.click(await screen.findByRole("switch", { name: "Include sub.asm in the link" }));
        await user.click(screen.getByRole("switch", { name: "Include main.asm in the link" }));
        await user.click(screen.getByRole("button", { name: "Run · 2 files" }));

        const tabs = () => screen.getAllByRole("tab").map((tab) => tab.textContent);
        await waitFor(() => expect(tabs()).toEqual(expect.arrayContaining(["main.obj", "PROG.out"])));
        expect(tabs()).not.toContain("sub.obj");
        expect(editors.get("PROG.out")?.bands).toMatchObject([{ from: 2, to: 3, colorIndex: 0, label: "main.asm · PROG" }]);
        expect(editors.get("PROG.out")?.language).toBe("sicxe-object");

        await user.click(screen.getByText("sub.asm"));
        await waitFor(() => expect(tabs()).toEqual(expect.arrayContaining(["sub.obj", "PROG.out"])));
        expect(tabs()).not.toContain("main.obj");
    });

    const linkedEvent = () => ({
        type: "ProgramLinked" as const,
        details: {
            loadAddress: 0x1000,
            estab: [
                { section: "PROG", symbol: "", address: 0, length: 8, file: "main.asm" },
                { section: "SUBB", symbol: "", address: 8, length: 3, file: "sub.asm" },
            ],
            objects: [{ source: "main.asm", text: "H PROG" }, { source: "sub.asm", text: "H SUBB" }],
            out: { name: "PROG", text: "H PROG   000000 00000B", bands: [] },
            trace: [{ pass: "2" as const, text: "+X at 000009", file: "sub.asm", line: 2, address: 9, before: 0, after: 8, symbol: "X" }],
        },
    });

    async function linkedRun(user: ReturnType<typeof userEvent.setup>) {
        await user.click(await screen.findByRole("switch", { name: "Include sub.asm in the link" }));
        await user.click(screen.getByRole("switch", { name: "Include main.asm in the link" }));
        await user.click(screen.getByRole("button", { name: "Run · 2 files" }));
    }

    it("shows the ESTAB of the last Run and nothing from a previous one after a failure", async () => {
        fake.loadFiles.mockResolvedValueOnce([linkedEvent()]);
        const user = await openPage();
        await linkedRun(user);
        await user.click(screen.getByRole("tab", { name: "Linker" }));
        expect(await screen.findByRole("table", { name: "External symbol table (ESTAB)" })).toBeTruthy();

        fake.loadFiles.mockRejectedValueOnce(new SimulatorCommandError(
            { type: "invalid_request", status: 400, title: "Bad", detail: "main.asm:3:1: error: undefined external symbol X" },
            [{ type: "MemoryCleared" }],
        ));
        await user.click(screen.getByRole("button", { name: "Run · 2 files" }));
        await waitFor(() => expect(screen.queryByRole("table", { name: "External symbol table (ESTAB)" })).toBeNull());
        expect(screen.getByText("Run a program to see the linker and the loader")).toBeTruthy();
    });

    it("opens a trace step's file, its .obj tab and its line", async () => {
        fake.loadFiles.mockResolvedValueOnce([linkedEvent()]);
        const user = await openPage();
        await linkedRun(user);
        await user.click(screen.getByRole("tab", { name: "Linker" }));
        await user.click(await screen.findByRole("tab", { name: "Trace" }));
        await user.click(screen.getByRole("button", { name: /\+X at 000009/ }));
        await waitFor(() => expect(screen.getByRole("tab", { name: "sub.obj" }).getAttribute("aria-selected")).toBe("true"));
        expect(editors.get("sub.asm")?.secondaryLine).toBe(2);
        expect(editors.get("sub.obj")?.language).toBe("sicxe-object");
    });

    it("follows the next instruction into its own file", async () => {
        fake.loadFiles.mockResolvedValueOnce([linkedEvent()]);
        fake.step.mockResolvedValueOnce([{
            type: "InstructionFetched", address: 0x1008, bytes: [0x4f, 0, 0], value: 0x4f0000,
            source_line: 2, source_file: "sub.asm", preview: true,
        }]);
        const user = await openPage();
        await linkedRun(user);
        await waitFor(() => expect(fake.loadFiles).toHaveBeenCalled());
        await user.click(screen.getByRole("button", { name: "Step" }));
        await waitFor(() => expect(editors.get("sub.asm")?.executingLine).toBe(2));
        expect(screen.getByRole("tab", { name: "sub.obj" })).toBeTruthy();
    });

    it("keeps the generated tabs and the executing line when the Run's file is renamed", async () => {
        const fetched = (line: number) => ({
            type: "InstructionFetched" as const, address: 0, bytes: [1, 0, 5], value: 0x010005,
            source_line: line, source_file: "main.asm", preview: true,
        });
        fake.loadFile.mockResolvedValueOnce([
            { type: "MacrosExpanded", details: { ...macroReportFixture, hasMacros: true, source: "main.asm" } },
            { ...linkedEvent(), details: { ...linkedEvent().details, objects: [{ source: "main.asm", text: "H PROG" }] } },
            fetched(1),
        ]);
        // The backend names the file as it was loaded until the next Run.
        fake.step.mockResolvedValueOnce([fetched(2)]);
        vi.spyOn(window, "prompt").mockReturnValue("prog.asm");
        const user = await openPage();
        await user.click(screen.getByRole("button", { name: "Run" }));
        await waitFor(() => expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toContain("main.obj"));

        await user.click(screen.getByTitle("main.asm"));
        await user.click(screen.getByRole("button", { name: "Rename selected item" }));
        await waitFor(() => expect(screen.getByTitle("prog.asm")).toBeTruthy());

        const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
        expect(tabs).toEqual(expect.arrayContaining(["MASMAPRG.ASM", "prog.obj", "PROG.out"]));
        expect(editors.get("prog.asm")?.headerActions).toBeTruthy();  // the Hide MASMAPRG.ASM toggle
        expect(editors.get("MASMAPRG.ASM")?.executingLine).toBe(1);

        await user.click(screen.getByRole("button", { name: "Step" }));
        await waitFor(() => expect(editors.get("MASMAPRG.ASM")?.executingLine).toBe(2));
    });

    it("refuses an address outside the memory", async () => {
        await openPage();
        typeAddress("FFFFFFF");
        expect(screen.getByRole("textbox", { name: "Load address" }).getAttribute("aria-invalid")).toBe("true");
        const runButton = screen.getByRole("button", { name: "Run" }) as HTMLButtonElement;
        expect(runButton.disabled).toBe(true);
        expect(screen.getByText("Not an address of this memory")).toBeTruthy();
    });
});
