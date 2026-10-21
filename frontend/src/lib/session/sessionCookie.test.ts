import { afterEach, describe, expect, it } from "vitest";

import { SESSION_COOKIE, createCookieSessionStore, createMemorySessionStore } from "@/lib/session/sessionCookie";

const SESSION = "3f2b8c1e-7a4d-4e9b-9c55-1d2a6b0f8e33";

function clearCookies() {
    for (const part of document.cookie.split(";")) {
        const name = part.split("=")[0].trim();
        if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
}

afterEach(clearCookies);

describe("cookie session store", () => {
    it("returns null when no session cookie is set", () => {
        document.cookie = "other=1; Path=/";
        expect(createCookieSessionStore().read()).toBeNull();
    });

    it("writes the session id to a frontend-managed cookie and reads it back", () => {
        const store = createCookieSessionStore();

        store.write(SESSION);

        expect(document.cookie).toContain(`${SESSION_COOKIE}=${SESSION}`);
        expect(store.read()).toBe(SESSION);
        expect(createCookieSessionStore().read()).toBe(SESSION);
    });

    it("finds the cookie among others", () => {
        document.cookie = "a=1; Path=/";
        document.cookie = `${SESSION_COOKIE}=${SESSION}; Path=/`;
        document.cookie = "b=2; Path=/";

        expect(createCookieSessionStore().read()).toBe(SESSION);
    });

    it("clears the cookie", () => {
        const store = createCookieSessionStore();
        store.write(SESSION);

        store.clear();

        expect(store.read()).toBeNull();
        expect(document.cookie).not.toContain(SESSION_COOKIE);
    });

    it("is inert without a document (server rendering)", () => {
        const store = createCookieSessionStore(() => undefined);

        expect(store.read()).toBeNull();
        expect(() => store.write(SESSION)).not.toThrow();
        expect(() => store.clear()).not.toThrow();
    });

    it("builds the cookie with path, lifetime and SameSite, adding Secure on https", () => {
        const written: string[] = [];
        const fakeDocument = {
            get cookie() {
                return "";
            },
            set cookie(value: string) {
                written.push(value);
            },
            location: { protocol: "https:" },
        } as unknown as Document;

        createCookieSessionStore(() => fakeDocument).write(SESSION);

        expect(written).toHaveLength(1);
        const attributes = written[0].split(";").map((part) => part.trim());
        expect(attributes[0]).toBe(`${SESSION_COOKIE}=${SESSION}`);
        expect(attributes).toContain("Path=/");
        expect(attributes).toContain("SameSite=Strict");
        expect(attributes).toContain("Secure");
        expect(attributes.some((part) => /^Max-Age=\d+$/.test(part))).toBe(true);
    });
});

describe("memory session store", () => {
    it("keeps the id in memory", () => {
        const store = createMemorySessionStore();
        expect(store.read()).toBeNull();
        store.write(SESSION);
        expect(store.read()).toBe(SESSION);
        store.clear();
        expect(store.read()).toBeNull();
    });
});
