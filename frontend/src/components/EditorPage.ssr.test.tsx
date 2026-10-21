// @vitest-environment node
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import EditorPage from "@/components/EditorPage";
import { Simulator } from "@/lib/simulator/Simulator";

// Monaco and xterm cannot even be imported outside a browser.
vi.mock("@/components/CodeEditor", () => ({ CodeEditor: () => null }));
vi.mock("@/components/Console", () => ({ Console: () => null }));

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("EditorPage on the server", () => {
    it("renders without creating the simulator or opening a WebSocket", () => {
        const sockets: string[] = [];
        vi.stubGlobal("WebSocket", class {
            static OPEN = 1;
            constructor(url: string) {
                sockets.push(url);
            }
        });
        const get = vi.spyOn(Simulator, "get");

        const html = renderToString(<EditorPage projectId="550e8400-e29b-41d4-a716-446655440000" />);

        expect(html).toContain("Loading project");
        expect(get).not.toHaveBeenCalled();
        expect(sockets).toEqual([]);
    });
});
