import { afterEach, describe, expect, it, vi } from "vitest";

import { AssemblerLanguageClient } from "@/lib/language/LanguageClient";

type MessageHandler = (event: { data: string }) => void;

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: MessageHandler | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    messages: Record<string, unknown>[] = [];

    constructor(readonly url: string) {
        FakeWebSocket.instances.push(this);
        queueMicrotask(() => {
            this.readyState = 1;
            this.onopen?.();
        });
    }

    send(raw: string): void {
        const message = JSON.parse(raw) as Record<string, unknown>;
        this.messages.push(message);
        if (message.method === "initialize") {
            queueMicrotask(() => this.deliver({
                jsonrpc: "2.0",
                id: message.id,
                result: { capabilities: { experimental: { sicxe: {
                    instructions: ["LDA"], directives: ["START"], registers: ["A"],
                } } } },
            }));
        } else if (message.method === "textDocument/didOpen") {
            const params = message.params as { textDocument: { uri: string; version: number } };
            queueMicrotask(() => this.deliver({
                jsonrpc: "2.0",
                method: "textDocument/publishDiagnostics",
                params: { uri: params.textDocument.uri, version: params.textDocument.version, diagnostics: [] },
            }));
        } else if (message.id !== undefined) {
            queueMicrotask(() => this.deliver({ jsonrpc: "2.0", id: message.id, result: { items: [] } }));
        }
    }

    deliver(message: unknown): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }

    close(): void {
        this.readyState = 3;
        this.onclose?.();
    }
}

describe("AssemblerLanguageClient", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        FakeWebSocket.instances = [];
    });

    it("initializes, opens a document, and routes diagnostics to its URI listener", async () => {
        vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
        const client = new AssemblerLanguageClient("ws://localhost:8080/language");
        const diagnostics = vi.fn();
        const unsubscribe = client.onDiagnostics("sicxe://demo/main.asm", diagnostics);

        await client.openDocument("sicxe://demo/main.asm", "P START 0");
        await Promise.resolve();

        const socket = FakeWebSocket.instances[0];
        expect(socket.messages.map((message) => message.method)).toEqual([
            "initialize", "initialized", "textDocument/didOpen",
        ]);
        expect(diagnostics).toHaveBeenCalledWith([]);

        unsubscribe();
        client.dispose();
    });

    it("opens a document before serving the first hover or completion request", async () => {
        vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
        const client = new AssemblerLanguageClient("ws://localhost:8080/language");
        const uri = "sicxe://demo/main.asm";

        const opening = client.openDocument(uri, "P START 0");
        const requesting = client.request("textDocument/completion", {
            textDocument: { uri },
            position: { line: 0, character: 0 },
        });
        await Promise.all([opening, requesting]);

        const methods = FakeWebSocket.instances[0].messages.map((message) => message.method);
        expect(methods.indexOf("textDocument/didOpen")).toBeLessThan(
            methods.indexOf("textDocument/completion"),
        );
        client.dispose();
    });

    it("debounces edits, sends the newest full text, and ignores stale diagnostics", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
        const client = new AssemblerLanguageClient("ws://localhost:8080/language");
        const diagnostics = vi.fn();
        client.onDiagnostics("sicxe://demo/main.asm", diagnostics);
        await client.openDocument("sicxe://demo/main.asm", "old");
        const socket = FakeWebSocket.instances[0];

        client.changeDocument("sicxe://demo/main.asm", "first");
        client.changeDocument("sicxe://demo/main.asm", "latest");
        socket.deliver({
            jsonrpc: "2.0",
            method: "textDocument/publishDiagnostics",
            params: { uri: "sicxe://demo/main.asm", version: 1, diagnostics: [{ message: "old" }] },
        });
        expect(diagnostics).toHaveBeenCalledTimes(0);

        await vi.advanceTimersByTimeAsync(250);
        const changes = socket.messages.filter((message) => message.method === "textDocument/didChange");
        expect(changes).toHaveLength(1);
        expect(changes[0].params).toMatchObject({
            textDocument: { version: 3 },
            contentChanges: [{ text: "latest" }],
        });

        client.dispose();
    });

    it("closes a document explicitly", async () => {
        vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
        const client = new AssemblerLanguageClient("ws://localhost:8080/language");
        await client.openDocument("sicxe://demo/main.asm", "source");
        await client.closeDocument("sicxe://demo/main.asm");

        expect(FakeWebSocket.instances[0].messages.at(-1)).toMatchObject({
            method: "textDocument/didClose",
            params: { textDocument: { uri: "sicxe://demo/main.asm" } },
        });
        client.dispose();
    });
});
