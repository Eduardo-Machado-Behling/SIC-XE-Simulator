import { describe, expect, it, vi } from "vitest";

import { buildFileTree } from "@/components/EditorPage";

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: () => null }));
vi.mock("@/components/Console", () => ({ Console: () => null }));

describe("buildFileTree", () => {
    it("marks only the generated file at the root", () => {
        const tree = buildFileTree({ "main.asm": "A", "MASMAPRG.ASM": "B", "sub/MASMAPRG.ASM": "C" }, ["sub"]);

        const byId = (nodes: typeof tree, id: string) => nodes.find((node) => node.id === id);
        expect(byId(tree, "MASMAPRG.ASM")?.generated).toBe(true);
        expect(byId(tree, "main.asm")?.generated).toBeFalsy();
        expect(byId(byId(tree, "sub")!.children!, "sub/MASMAPRG.ASM")?.generated).toBeFalsy();
    });
});
