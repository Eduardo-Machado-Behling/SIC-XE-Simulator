import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebTransport } from "@/lib/transport/WebTransport";

// A WebSocket that opens at once and records what the client sends; the test
// plays the server by calling reply().
class FakeSocket {
    static OPEN = 1;
    static last: FakeSocket | null = null;

    readyState = 0;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(readonly url: string) {
        FakeSocket.last = this;
        queueMicrotask(() => {
            this.readyState = FakeSocket.OPEN;
            this.onopen?.();
        });
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {}

    reply(message: unknown) {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

describe("WebTransport.clearMemory", () => {
    beforeEach(() => {
        vi.stubGlobal("WebSocket", FakeSocket);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        FakeSocket.last = null;
    });

    it("sends the 'clear' command and resolves with the normalized events", async () => {
        const transport = new WebTransport("127.0.0.1:1");
        const cleared = transport.clearMemory();

        await vi.waitFor(() => expect(FakeSocket.last?.sent).toHaveLength(1));
        const request = JSON.parse(FakeSocket.last!.sent[0]);
        expect(request).toMatchObject({ type: "command", payload: "clear" });

        FakeSocket.last!.reply({ id: request.id, result: [{ type: "MemoryCleared" }] });
        await expect(cleared).resolves.toEqual([{ type: "MemoryCleared" }]);
    });

    it("rejects with the server's error message", async () => {
        const transport = new WebTransport("127.0.0.1:1");
        const cleared = transport.clearMemory();

        await vi.waitFor(() => expect(FakeSocket.last?.sent).toHaveLength(1));
        const request = JSON.parse(FakeSocket.last!.sent[0]);

        FakeSocket.last!.reply({ id: request.id, error: "no simulator" });
        await expect(cleared).rejects.toThrow("no simulator");
    });
});
