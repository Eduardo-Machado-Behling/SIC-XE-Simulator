import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EditorPage from "@/components/EditorPage";
import type { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import { readLinkSettings } from "@/lib/simulator/linkSettings";

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

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: () => null }));
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

    it("refuses an address outside the memory", async () => {
        await openPage();
        typeAddress("FFFFFFF");
        expect(screen.getByRole("textbox", { name: "Load address" }).getAttribute("aria-invalid")).toBe("true");
        const runButton = screen.getByRole("button", { name: "Run" }) as HTMLButtonElement;
        expect(runButton.disabled).toBe(true);
        expect(screen.getByText("Not an address of this memory")).toBeTruthy();
    });
});
