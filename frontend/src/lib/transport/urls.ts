export function simulatorBaseUrl(): string {
    return process.env.NEXT_PUBLIC_SIMULATOR_URL ?? "http://localhost:8080";
}

export function simulatorWebSocketUrl(path: string): string {
    const configured = simulatorBaseUrl();
    const base = new URL(configured.includes("://") ? configured : `http://${configured}`);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    base.pathname = path.startsWith("/") ? path : `/${path}`;
    base.search = "";
    base.hash = "";
    return base.toString();
}
