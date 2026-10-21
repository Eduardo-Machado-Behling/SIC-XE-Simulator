import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FileExplorer, type FileNode } from "@/components/FileExplorer";

const tree: FileNode[] = [
    { id: "src", name: "src", children: [{ id: "src/data.asm", name: "data.asm" }] },
    { id: "main.asm", name: "main.asm" },
];

describe("FileExplorer file actions", () => {
    it("offers no create or delete controls unless the page handles them", () => {
        render(<FileExplorer tree={tree} activeFile="main.asm" onSelectFile={() => {}} />);

        expect(screen.queryByRole("button", { name: "New file" })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
    });

    it("creates a file from the typed path", async () => {
        const user = userEvent.setup();
        const onCreateFile = vi.fn();
        render(<FileExplorer tree={tree} activeFile="main.asm" onSelectFile={() => {}} onCreateFile={onCreateFile} />);

        await user.click(screen.getByRole("button", { name: "New file" }));
        await user.type(screen.getByLabelText("New file path"), "src/loop.asm{Enter}");

        expect(onCreateFile).toHaveBeenCalledWith("src/loop.asm");
        expect(screen.queryByLabelText("New file path")).toBeNull();
    });

    it("cancels file creation with Escape", async () => {
        const user = userEvent.setup();
        const onCreateFile = vi.fn();
        render(<FileExplorer tree={tree} activeFile="main.asm" onSelectFile={() => {}} onCreateFile={onCreateFile} />);

        await user.click(screen.getByRole("button", { name: "New file" }));
        await user.type(screen.getByLabelText("New file path"), "x.asm{Escape}");

        expect(onCreateFile).not.toHaveBeenCalled();
        expect(screen.queryByLabelText("New file path")).toBeNull();
    });

    it("deletes a file (not a folder) without selecting it", async () => {
        const user = userEvent.setup();
        const onDeleteFile = vi.fn();
        const onSelectFile = vi.fn();
        render(<FileExplorer tree={tree} activeFile="main.asm" onSelectFile={onSelectFile} onDeleteFile={onDeleteFile} />);

        await user.click(screen.getByRole("button", { name: "Delete src/data.asm" }));

        expect(onDeleteFile).toHaveBeenCalledWith("src/data.asm");
        expect(onSelectFile).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Delete src" })).toBeNull();
    });
});
