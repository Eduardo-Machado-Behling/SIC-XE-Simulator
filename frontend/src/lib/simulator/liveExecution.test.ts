// @vitest-environment node
/**
 * Opt-in check of LegacyExecutionBridge against a running backend
 * (Node's own WebSocket and fetch, so no browser CORS or jsdom events):
 *
 *   LIVE_BACKEND_URL=http://localhost:8080 npx vitest run src/lib/simulator/liveExecution.test.ts
 *
 * Skipped when LIVE_BACKEND_URL is not set, so `npm test` never needs a server.
 */
import { afterAll, describe, expect, it } from "vitest";

import { LegacyExecutionBridge } from "@/lib/simulator/LegacyExecutionBridge";
import type { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import type { Project } from "@/lib/simulator/Project";
import { WebTransport } from "@/lib/transport/WebTransport";

const baseUrl = process.env.LIVE_BACKEND_URL;

// LDA FIVE is a 3-byte format-3 instruction at address 0, so FIVE is at 3.
const program = (value: number) => ` START 0\n LDA FIVE\nFIVE WORD ${value}\n`;

function registerA(events: ExecutionEvent[]): number | undefined {
    const write = events.findLast((event) => event.type === "RegisterWrite" && event.name === "A");
    return write?.type === "RegisterWrite" ? write.value : undefined;
}

describe.skipIf(!baseUrl)("live execution through the legacy bridge", () => {
    const transport = new WebTransport(baseUrl ?? "http://localhost:8080");
    const bridge = new LegacyExecutionBridge({ baseUrl: baseUrl ?? "http://localhost:8080", transport });
    const project: Project = { id: crypto.randomUUID(), name: "Live run", architecture: "SIC-XE", files: { "main.asm": program(5) } };

    afterAll(() => transport.disconnect());

    it("binds a session project (UUID id) and returns its ArchitectureInfo", async () => {
        const arch = await bridge.bind(project);

        expect(arch.registers.map((register) => register.name)).toContain("A");
        expect(arch.memory.address_space_size).toBeGreaterThan(0);
    });

    it("runs the browser's content and steps through it", async () => {
        const assembled = await bridge.run(project, "main.asm");

        const symbols = assembled.find((event) => event.type === "ProgramAssembled");
        expect(symbols?.type === "ProgramAssembled" && symbols.details.symbols).toContainEqual({ name: "FIVE", value: 3 });

        const step = await bridge.exclusive(() => transport.step());
        expect(registerA(step)).toBe(5);
    });

    it("runs edited content, not a copy staged earlier", async () => {
        await bridge.run({ ...project, files: { "main.asm": program(7) } }, "main.asm");

        const step = await bridge.exclusive(() => transport.step());
        expect(registerA(step)).toBe(7);
    });
});
