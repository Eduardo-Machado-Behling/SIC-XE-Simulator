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
