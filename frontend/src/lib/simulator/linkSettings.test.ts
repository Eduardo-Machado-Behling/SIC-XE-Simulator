import { afterEach, describe, expect, it, vi } from "vitest";

import { readLinkSettings, writeLinkSettings } from "@/lib/simulator/linkSettings";

describe("link settings", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it("are kept per project", () => {
        writeLinkSettings("one", { linkSet: ["main.asm", "sub.asm"], loadAddress: 0x1000 });
        expect(readLinkSettings("one")).toEqual({ linkSet: ["main.asm", "sub.asm"], loadAddress: 0x1000 });
        expect(readLinkSettings("two")).toEqual({ linkSet: [], loadAddress: 0 });
    });

    it("fall back to an empty set at address 0 when storage is unusable", () => {
        localStorage.setItem("sicxe.link.broken", "{not json");
        expect(readLinkSettings("broken")).toEqual({ linkSet: [], loadAddress: 0 });
        localStorage.setItem("sicxe.link.odd", JSON.stringify({ linkSet: [3], loadAddress: "x" }));
        expect(readLinkSettings("odd")).toEqual({ linkSet: [], loadAddress: 0 });

        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
        expect(readLinkSettings("one")).toEqual({ linkSet: [], loadAddress: 0 });
        expect(() => writeLinkSettings("one", { linkSet: ["a.asm"], loadAddress: 1 })).not.toThrow();
    });
});
