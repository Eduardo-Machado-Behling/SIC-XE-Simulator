import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FileExplorer, type FileNode } from "@/components/FileExplorer";

const tree: FileNode[] = [
    { id: "MASMAPRG.ASM", name: "MASMAPRG.ASM", generated: true },
    { id: "main.asm", name: "main.asm" },
];

function renderExplorer() {
    const handlers = {
        onSelectFile: vi.fn(),
        onCreateFile: vi.fn(),
        onCreateFolder: vi.fn(),
        onDelete: vi.fn(),
        onRename: vi.fn(),
        onMove: vi.fn(),
    };
    render(<FileExplorer tree={tree} activeFile="main.asm" {...handlers} />);
    return handlers;
}

describe("FileExplorer generated file", () => {
    it("shows the generated badge only on the generated node", () => {
        renderExplorer();

        expect(screen.getAllByText("generated")).toHaveLength(1);
    });

    it("disables rename for the generated file but keeps delete enabled", async () => {
        renderExplorer();
        const rename = screen.getByRole("button", { name: "Rename selected item" });
        const remove = screen.getByRole("button", { name: "Delete selected item" });

        await userEvent.click(screen.getByText("main.asm"));
        expect((rename as HTMLButtonElement).disabled).toBe(false);

        await userEvent.click(screen.getByText("MASMAPRG.ASM"));
        expect((rename as HTMLButtonElement).disabled).toBe(true);
        expect((remove as HTMLButtonElement).disabled).toBe(false);
    });
});

describe("FileExplorer link switches", () => {
    const linkTree: FileNode[] = [
        { id: "MASMAPRG.ASM", name: "MASMAPRG.ASM", generated: true },
        { id: "main.asm", name: "main.asm", linkable: true, included: true, entry: true },
        { id: "sub.asm", name: "sub.asm", linkable: true, included: false },
        { id: "dump.asm", name: "dump.asm" },
    ];

    function renderLinkExplorer() {
        const handlers = {
            onSelectFile: vi.fn(), onCreateFile: vi.fn(), onCreateFolder: vi.fn(),
            onDelete: vi.fn(), onRename: vi.fn(), onMove: vi.fn(), onToggleLink: vi.fn(),
        };
        render(<FileExplorer tree={linkTree} activeFile="main.asm" {...handlers} />);
        return handlers;
    }

    it("offers a switch on each source that can be linked, and only there", () => {
        renderLinkExplorer();
        expect(screen.getAllByRole("switch")).toHaveLength(2);
        expect(screen.getByRole("switch", { name: "Include main.asm in the link" }).getAttribute("aria-checked")).toBe("true");
        expect(screen.getByRole("switch", { name: "Include sub.asm in the link" }).getAttribute("aria-checked")).toBe("false");
    });

    it("toggles a file without opening it", async () => {
        const handlers = renderLinkExplorer();
        await userEvent.click(screen.getByRole("switch", { name: "Include sub.asm in the link" }));
        expect(handlers.onToggleLink).toHaveBeenCalledWith("sub.asm");
        expect(handlers.onSelectFile).not.toHaveBeenCalled();
    });

    it("marks the ENTRY file", () => {
        renderLinkExplorer();
        expect(screen.getAllByText("entry")).toHaveLength(1);
    });
});
