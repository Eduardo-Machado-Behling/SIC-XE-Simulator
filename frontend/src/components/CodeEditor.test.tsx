import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CodeEditor } from "./CodeEditor";

const editors: Record<string, unknown>[] = [];
vi.mock("@monaco-editor/react", () => ({
    default: (props: Record<string, unknown>) => { editors.push(props); return null; },
}));

describe("CodeEditor theme", () => {
    // Monaco has one theme for the whole page: the last editor to mount sets it for all.
    // A plaintext pane (the .obj, the .out) must not drop the SIC/XE token colours.
    it("gives a plaintext editor the same theme as a SIC/XE one, and defines it", () => {
        render(<CodeEditor path="prog.obj" value="H PROG" language="plaintext" onChange={() => {}} readOnly />);
        const props = editors.at(-1)!;
        expect(props.theme).toBe("sicxe-dark");

        const defineTheme = vi.fn();
        const monaco = {
            editor: { defineTheme },
            // Every language registration is a no-op here; only the theme matters.
            languages: new Proxy({ getLanguages: () => [{ id: "sicxe" }] } as Record<string, unknown>, {
                get: (target, key: string) => target[key] ?? vi.fn(),
            }),
        };
        (props.beforeMount as (m: unknown) => void)(monaco);
        expect(defineTheme).toHaveBeenCalledWith("sicxe-dark", expect.anything());
    });
});
