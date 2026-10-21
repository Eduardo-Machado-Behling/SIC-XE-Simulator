/**
 * Where the anonymous session id lives in the browser. api_spec/openapi.yaml
 * has the frontend (not the server) keep it in a cookie. Everything touches
 * `document` lazily so importing this module during server rendering is safe.
 */

export const SESSION_COOKIE = "sicxe_session";

/** One year; an id the server has forgotten is replaced through recovery. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface SessionIdStore {
    read(): string | null;
    write(sessionId: string): void;
    clear(): void;
}

const browserDocument = (): Document | undefined => (typeof document === "undefined" ? undefined : document);

export function createCookieSessionStore(getDocument: () => Document | undefined = browserDocument): SessionIdStore {
    const set = (value: string, maxAge: number) => {
        const doc = getDocument();
        if (!doc) return;
        const secure = doc.location?.protocol === "https:" ? "; Secure" : "";
        doc.cookie = `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Strict${secure}`;
    };

    return {
        read() {
            const doc = getDocument();
            if (!doc) return null;
            for (const part of doc.cookie.split(";")) {
                const separator = part.indexOf("=");
                if (separator < 0) continue;
                if (part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
                try {
                    const value = decodeURIComponent(part.slice(separator + 1).trim());
                    return value || null;
                } catch {
                    return null;
                }
            }
            return null;
        },
        write(sessionId) {
            set(sessionId, MAX_AGE_SECONDS);
        },
        clear() {
            set("", 0);
        },
    };
}

export function createMemorySessionStore(): SessionIdStore {
    let current: string | null = null;
    return {
        read: () => current,
        write: (sessionId) => {
            current = sessionId;
        },
        clear: () => {
            current = null;
        },
    };
}
