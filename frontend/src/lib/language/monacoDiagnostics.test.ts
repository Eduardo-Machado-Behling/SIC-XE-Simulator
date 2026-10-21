import { describe, expect, it } from "vitest";

import { toMonacoMarker } from "@/lib/language/monacoDiagnostics";
import type { Monaco } from "@monaco-editor/react";

describe("Monaco diagnostic mapping", () => {
    it("converts LSP zero-based ranges and severity to Monaco markers", () => {
        const monaco = {
            MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
        } as unknown as Monaco;
        const marker = toMonacoMarker(monaco, {
            range: {
                start: { line: 4, character: 6 },
                end: { line: 4, character: 10 },
            },
            severity: 1,
            message: "Unknown symbol",
        });

        expect(marker).toMatchObject({
            startLineNumber: 5,
            startColumn: 7,
            endLineNumber: 5,
            endColumn: 11,
            severity: 8,
            source: "SIC/XE assembler",
            message: "Unknown symbol",
        });
    });
});
