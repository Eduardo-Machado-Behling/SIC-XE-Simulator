import { describe, expect, it } from "vitest";

import { DEFAULT_BACKEND_URL, resolveBackendUrl, toWebSocketUrl } from "@/lib/api/config";

describe("resolveBackendUrl", () => {
    it("defaults to the local development server when nothing is configured", () => {
        expect(DEFAULT_BACKEND_URL).toBe("http://localhost:8080");
        expect(resolveBackendUrl(undefined)).toBe("http://localhost:8080");
        expect(resolveBackendUrl("   ")).toBe("http://localhost:8080");
    });

    it("uses the configured server and drops trailing slashes", () => {
        expect(resolveBackendUrl("https://sic-xe-engine.onrender.com/")).toBe("https://sic-xe-engine.onrender.com");
        expect(resolveBackendUrl(" http://127.0.0.1:9000// ")).toBe("http://127.0.0.1:9000");
        expect(resolveBackendUrl("https://example.org/api")).toBe("https://example.org/api");
    });

    it("rejects values that are not http(s) URLs instead of silently building broken requests", () => {
        expect(() => resolveBackendUrl("localhost:8080")).toThrow(/NEXT_PUBLIC_BACKEND_URL/);
        expect(() => resolveBackendUrl("ftp://example.org")).toThrow(/NEXT_PUBLIC_BACKEND_URL/);
    });
});

describe("toWebSocketUrl", () => {
    it("maps http to ws and https to wss on the /ws path", () => {
        expect(toWebSocketUrl("http://localhost:8080")).toBe("ws://localhost:8080/ws");
        expect(toWebSocketUrl("https://sic-xe-engine.onrender.com")).toBe("wss://sic-xe-engine.onrender.com/ws");
        expect(toWebSocketUrl("https://example.org/api")).toBe("wss://example.org/api/ws");
    });
});
