/**
 * Simulator execution over /ws. This protocol is not part of
 * api_spec/openapi.yaml and is kept separate from the HTTP contract tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebTransport } from "@/lib/transport/WebTransport";

type Sent = { id: string; type: string; payload: string };

class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static instances: FakeWebSocket[] = [];

    readyState = FakeWebSocket.CONNECTING;
    sent: Sent[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(readonly url: string) {
        FakeWebSocket.instances.push(this);
        queueMicrotask(() => {
            this.readyState = FakeWebSocket.OPEN;
            this.onopen?.();
        });
    }

    send(data: string) {
        this.sent.push(JSON.parse(data));
    }

    close() {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.();
    }

    reply(result: unknown, error?: string) {
        const last = this.sent.at(-1)!;
        this.onmessage?.({ data: JSON.stringify(error ? { id: last.id, error } : { id: last.id, result }) });
    }
}

const fetchSpy = vi.fn();

beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    fetchSpy.mockReset();
});

async function sentCommand(): Promise<FakeWebSocket> {
    await vi.waitFor(() => expect(FakeWebSocket.instances[0]?.sent.length).toBeGreaterThan(0));
    return FakeWebSocket.instances[0];
}

const registerWrite = { type: "RegisterWrite", name: "A", value: [0, 0, 5], old_value: [0, 0, 0] };

describe("WebTransport", () => {
    it("derives the socket URL from the configured backend", async () => {
        new WebTransport("http://localhost:8080").connect();
        new WebTransport("https://sic-xe-engine.onrender.com").connect();

        expect(FakeWebSocket.instances.map((socket) => socket.url)).toEqual([
            "ws://localhost:8080/ws",
            "wss://sic-xe-engine.onrender.com/ws",
        ]);
    });

    // backend/docs/websocket-protocol.md: `step` answers with the events
    // themselves, `load %<file>`, `reset` and `clear` with an event batch.
    it.each([
        ["step", (t: WebTransport) => t.step(), "step", [registerWrite]],
        ["reset", (t: WebTransport) => t.reset(), "reset", { from: 3, to: 4, events: [registerWrite] }],
        ["clear", (t: WebTransport) => t.clear(), "clear", { from: 3, to: 4, events: [registerWrite] }],
        ["loadFile", (t: WebTransport) => t.loadFile("main.asm"), "load %main.asm", { from: 3, to: 4, events: [registerWrite] }],
    ])("%s sends a correlated command and resolves normalised events", async (_name, call, payload, answer) => {
        const transport = new WebTransport("http://localhost:8080");

        const result = call(transport);
        const socket = await sentCommand();
        expect(socket.sent[0]).toMatchObject({ type: "command", payload });
        expect(socket.sent[0].id).toEqual(expect.any(String));
        socket.reply(answer);

        await expect(result).resolves.toEqual([
            { type: "RegisterWrite", name: "A", bytes: [0, 0, 5], value: 5, old_bytes: [0, 0, 0], old_value: 0 },
        ]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("loads a project's architecture info over the socket", async () => {
        const transport = new WebTransport("http://localhost:8080");
        const answer = { project: { id: "0", name: "Hello", architecture: "sic-xe", files: {} }, arch: { name: "SIC/XE" } };

        const result = transport.loadProject("0");
        const socket = await sentCommand();
        expect(socket.sent[0].payload).toBe("load $0");
        socket.reply(answer);

        await expect(result).resolves.toEqual(answer);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("gives up on a project load the simulator never answers", async () => {
        vi.useFakeTimers();
        const transport = new WebTransport("http://localhost:8080", { loadTimeoutMs: 5_000 });

        const result = transport.loadProject("550e8400-e29b-41d4-a716-446655440000");
        const failure = expect(result).rejects.toThrow(/did not answer/);
        await vi.advanceTimersByTimeAsync(5_000);

        await failure;
    });

    it("rejects with the simulator's error message", async () => {
        const transport = new WebTransport("http://localhost:8080");

        const result = transport.step();
        (await sentCommand()).reply(undefined, "no program loaded");

        await expect(result).rejects.toThrow("no program loaded");
    });

    it("rejects pending commands when the connection closes", async () => {
        const transport = new WebTransport("http://localhost:8080");

        const result = transport.step();
        (await sentCommand()).close();

        await expect(result).rejects.toThrow(/closed/);
    });
});
