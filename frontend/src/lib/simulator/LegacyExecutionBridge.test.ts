/**
 * The temporary bridge that lets the /ws simulator execute a browser-stored
 * project (see LegacyExecutionBridge.ts). Commands and HTTP calls are logged
 * in one list so their order can be asserted.
 */
import { describe, expect, it } from "vitest";

import { LegacyExecutionBridge } from "@/lib/simulator/LegacyExecutionBridge";
import type { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import type { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import type { Project } from "@/lib/simulator/Project";
import { json } from "@/test/fakeBackend";

const A = "550e8400-e29b-41d4-a716-446655440000";
const project: Project = {
    id: A,
    name: "Hello & bye",
    architecture: "SIC-XE",
    files: { "main.asm": "LDA #1", "data.asm": "WORD 1" },
};
const arch = { name: "SIC/XE" } as unknown as ArchitectureInfo;
const events: ExecutionEvent[] = [{ type: "Reset" } as unknown as ExecutionEvent];

function setup(options: { architectures?: string[]; failRoute?: RegExp; wsLoadFails?: boolean } = {}) {
    const log: string[] = [];
    const bodies: unknown[] = [];

    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = new URL(String(input));
        const line = `${init.method ?? "GET"} ${url.pathname}${url.search}`;
        log.push(line);
        if (typeof init.body === "string") bodies.push(JSON.parse(init.body));
        if (options.failRoute?.test(line)) return json(400, { error: "boom" });
        if (url.pathname === "/simulator/architectures") return json(200, options.architectures ?? ["SIC-XE"]);
        return json(200, { message: "ok" });
    }) as typeof globalThis.fetch;

    const transport = {
        async loadProject(id: string) {
            log.push(`ws load $${id}`);
            if (options.wsLoadFails) throw new Error("Simulator did not answer");
            return { project: { ...project, id }, arch };
        },
        async loadFile(path: string) {
            log.push(`ws load %${path}`);
            return events;
        },
    };

    const bridge = new LegacyExecutionBridge({ baseUrl: "http://localhost:8080", transport, fetch });
    return { bridge, log, bodies };
}

const HEX = "550e8400e29b41d4a716446655440000";

describe("LegacyExecutionBridge", () => {
    it("binds a browser project: legacy project, then the /ws load, then every file", async () => {
        const { bridge, log, bodies } = setup();

        await expect(bridge.bind(project)).resolves.toBe(arch);

        expect(log).toEqual([
            "GET /simulator/architectures",
            `PUT /project?id=${HEX}&name=Hello+%26+bye&arch=sic-xe`,
            `ws load $${HEX}`,
            "PUT /simulator/project/file",
            "PUT /simulator/project/file",
        ]);
        expect(bodies).toEqual([
            { filePath: "data.asm", content: "WORD 1" },
            { filePath: "main.asm", content: "LDA #1" },
        ]);
    });

    it("runs a file from the browser's current content, staged right before the run", async () => {
        const { bridge, log, bodies } = setup();

        await expect(bridge.run({ ...project, files: { "main.asm": "LDA #2" } }, "main.asm")).resolves.toBe(events);

        expect(log.slice(1)).toEqual([
            `PUT /project?id=${HEX}&name=Hello+%26+bye&arch=sic-xe`,
            `ws load $${HEX}`,
            "PUT /simulator/project/file",
            "ws load %main.asm",
        ]);
        expect(bodies).toEqual([{ filePath: "main.asm", content: "LDA #2" }]);
    });

    it("asks for the architecture list only once", async () => {
        const { bridge, log } = setup();

        await bridge.bind(project);
        await bridge.run(project, "main.asm");

        expect(log.filter((line) => line.includes("architectures"))).toHaveLength(1);
    });

    it("refuses an architecture the server cannot simulate before staging anything", async () => {
        const { bridge, log } = setup({ architectures: ["SIC-XE"] });

        await expect(bridge.bind({ ...project, architecture: "SIC" })).rejects.toThrow(/SIC.*not available/);

        expect(log).toEqual(["GET /simulator/architectures"]);
    });

    it.each(["src/main.asm", "my file.asm"])("refuses to run %s, which the /ws command cannot name", async (path) => {
        const { bridge, log } = setup();

        await expect(bridge.run({ ...project, files: { [path]: "END" } }, path)).rejects.toThrow(/cannot run/);

        expect(log).toEqual([]);
    });

    it("refuses to run a file the project does not have", async () => {
        const { bridge, log } = setup();

        await expect(bridge.run(project, "toString")).rejects.toThrow(/no file/);

        expect(log).toEqual([]);
    });

    it("reports a legacy route failure with the server's message and stops", async () => {
        const { bridge, log } = setup({ failRoute: /^PUT \/project\?/ });

        await expect(bridge.run(project, "main.asm")).rejects.toThrow(/boom/);

        expect(log.some((line) => line.startsWith("ws"))).toBe(false);
    });

    // The legacy project is re-created (files reset) by every bind, so a second
    // run must not start staging while the first is between its steps.
    it("runs one staging at a time, so two quick runs each execute their own content", async () => {
        const { bridge, log, bodies } = setup();

        const first = bridge.run({ ...project, files: { "main.asm": "LDA #1" } }, "main.asm");
        const second = bridge.run({ ...project, files: { "main.asm": "LDA #2" } }, "main.asm");
        await Promise.all([first, second]);

        const once = [
            `PUT /project?id=${HEX}&name=Hello+%26+bye&arch=sic-xe`,
            `ws load $${HEX}`,
            "PUT /simulator/project/file",
            "ws load %main.asm",
        ];
        expect(log).toEqual(["GET /simulator/architectures", ...once, ...once]);
        expect(bodies).toEqual([
            { filePath: "main.asm", content: "LDA #1" },
            { filePath: "main.asm", content: "LDA #2" },
        ]);
    });

    it("holds other simulator commands (step, reset) until a staging in progress is done", async () => {
        const { bridge, log } = setup();

        const run = bridge.run(project, "main.asm");
        const step = bridge.exclusive(async () => {
            log.push("ws step");
        });
        await Promise.all([run, step]);

        expect(log.at(-1)).toBe("ws step");
        expect(log.at(-2)).toBe("ws load %main.asm");
    });

    it("keeps working after a failed staging", async () => {
        const { bridge, log } = setup({ failRoute: /^PUT \/project\?/ });

        const failed = bridge.run(project, "main.asm");
        const next = bridge.bind({ ...project, architecture: "SIC" });

        await expect(failed).rejects.toThrow(/boom/);
        await expect(next).rejects.toThrow(/not available/);
        expect(log.filter((line) => line.startsWith("PUT /project?"))).toHaveLength(1);
    });

    it("does not run when the /ws load fails", async () => {
        const { bridge, log } = setup({ wsLoadFails: true });

        await expect(bridge.run(project, "main.asm")).rejects.toThrow(/did not answer/);

        expect(log).not.toContain("ws load %main.asm");
    });
});
