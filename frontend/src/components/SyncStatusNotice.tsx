"use client";

import type { SyncStatus } from "@/lib/projects/ProjectSync";

export type SyncStatusNoticeProps = {
    status: SyncStatus;
    /** Another message to show, e.g. why architecture info is missing. */
    extra?: string | null;
};

/** One line about server sync; empty when there is nothing worth saying. */
export function SyncStatusNotice({ status, extra }: SyncStatusNoticeProps) {
    const messages: string[] = [];

    if (status.state === "synced" && status.recoveredSession) {
        messages.push("The server had forgotten this session; a new session was created and your projects were synced again.");
    }
    if (status.state === "error") {
        const localOnly = status.kind === "network" ? "" : " Your changes are kept in this browser.";
        messages.push(`${status.message}${localOnly}`);
    }
    if (extra) messages.push(extra);

    if (messages.length === 0) return null;

    return (
        <div
            role="status"
            className={`
                shrink-0
                px-3
                py-1
                text-xs
                ${status.state === "error" ? "bg-amber-950 text-amber-200" : "bg-zinc-900 text-zinc-300"}
            `}
        >
            {messages.map((message) => (
                <p key={message}>{message}</p>
            ))}
        </div>
    );
}
