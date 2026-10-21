import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SyncStatusNotice } from "@/components/SyncStatusNotice";

describe("SyncStatusNotice", () => {
    it("says nothing while idle or after a plain sync", () => {
        const { container, rerender } = render(<SyncStatusNotice status={{ state: "idle" }} />);
        expect(container.textContent).toBe("");

        rerender(<SyncStatusNotice status={{ state: "synced", recoveredSession: false }} />);
        expect(container.textContent).toBe("");
    });

    it("explains a session recovery", () => {
        render(<SyncStatusNotice status={{ state: "synced", recoveredSession: true }} />);

        expect(screen.getByRole("status").textContent).toMatch(/new session/i);
    });

    it("says how many projects came back from the server after unreadable local data", () => {
        render(<SyncStatusNotice status={{ state: "synced", recoveredSession: false, restoredProjects: 2 }} />);

        expect(screen.getByRole("status").textContent).toMatch(/could not be read.*2 projects were restored from the server/i);
    });

    it.each([
        ["project-not-found", /project does not exist on the server/i],
        ["invalid-request", /rejected/i],
        ["network", /unreachable/i],
    ] as const)("tells a %s failure apart", (kind, text) => {
        const messages = {
            "project-not-found": "The project does not exist on the server.",
            "invalid-request": "The server rejected the request: bad path",
            network: "The server is unreachable; changes are kept in this browser.",
        };

        render(<SyncStatusNotice status={{ state: "error", kind, message: messages[kind] }} />);

        expect(screen.getByRole("status").textContent).toMatch(text);
    });

    it("adds an extra message such as a missing architecture description", () => {
        render(<SyncStatusNotice status={{ state: "idle" }} extra="Architecture info unavailable: timeout" />);

        expect(screen.getByRole("status").textContent).toContain("Architecture info unavailable: timeout");
    });
});
