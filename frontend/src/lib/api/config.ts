/**
 * Where the backend lives. api_spec/openapi.yaml lists a production server
 * (https://sic-xe-engine.onrender.com) and a local one (http://localhost:8080);
 * NEXT_PUBLIC_BACKEND_URL picks one at build time and the local server is the
 * default, which is what the frontend always used before.
 */
export const DEFAULT_BACKEND_URL = "http://localhost:8080";

/**
 * Normalises a backend base URL (no trailing slash). `process.env.NEXT_PUBLIC_*`
 * must be referenced literally for Next.js to inline it into the browser bundle.
 */
export function resolveBackendUrl(raw: string | undefined = process.env.NEXT_PUBLIC_BACKEND_URL): string {
    const value = raw?.trim();
    if (!value) return DEFAULT_BACKEND_URL;

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`NEXT_PUBLIC_BACKEND_URL must be an http(s) URL, got ${JSON.stringify(value)}`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`NEXT_PUBLIC_BACKEND_URL must be an http(s) URL, got ${JSON.stringify(value)}`);
    }

    return value.replace(/\/+$/, "");
}

/** The simulator's WebSocket endpoint on the same server: ws(s)://<host>/ws. */
export function toWebSocketUrl(httpBaseUrl: string): string {
    return `${httpBaseUrl.replace(/^http/, "ws").replace(/\/+$/, "")}/ws`;
}
