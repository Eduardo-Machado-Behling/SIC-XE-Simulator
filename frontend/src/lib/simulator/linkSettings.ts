// Which files Run links and where the loader puts the program, per project. They are UI
// state, kept in this browser only: the project files (and the API) do not carry them.

export interface LinkSettings {
    /** Files switched on for linking; empty means Run assembles the open file alone. */
    linkSet: string[];
    /** PROGADDR, the address the relocating loader places the program at. */
    loadAddress: number;
}

const DEFAULTS: LinkSettings = { linkSet: [], loadAddress: 0 };

const key = (projectId: string) => `sicxe.link.${projectId}`;

export function readLinkSettings(projectId: string): LinkSettings {
    try {
        const raw = localStorage.getItem(key(projectId));
        if (!raw) return { ...DEFAULTS, linkSet: [] };
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return { ...DEFAULTS, linkSet: [] };
        const { linkSet, loadAddress } = parsed as Record<string, unknown>;
        if (!Array.isArray(linkSet) || !linkSet.every((path) => typeof path === "string")) return { ...DEFAULTS, linkSet: [] };
        if (typeof loadAddress !== "number" || !Number.isInteger(loadAddress) || loadAddress < 0) return { ...DEFAULTS, linkSet: [] };
        return { linkSet, loadAddress };
    } catch {
        return { ...DEFAULTS, linkSet: [] };
    }
}

export function writeLinkSettings(projectId: string, settings: LinkSettings): void {
    try {
        localStorage.setItem(key(projectId), JSON.stringify(settings));
    } catch {
        // Private windows and blocked storage: the settings last until the page closes.
    }
}
