import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProjectsPage from "@/app/page";
import { DEFAULT_MACRO_SOURCE } from "@/lib/simulator/defaultMacroSource";
import { DEFAULT_MAIN_SOURCE } from "@/lib/simulator/defaultMainSource";
import type { Project } from "@/lib/simulator/Project";

// The projects page with its backends faked: the simulator answers one
// architecture, and the project store keeps what the page saves.
const store = vi.hoisted(() => ({
    stored: [] as Project[],
    saved: [] as Project[][],
}));

// One object for every render: the page's effect depends on it.
const simulator = vi.hoisted(() => ({ architectures: async () => ["SIC/XE"] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

vi.mock("@/lib/simulator/Simulator", () => ({
    Simulator: { get: () => simulator },
}));

vi.mock("@/lib/simulator/ProjectSessionSync", () => ({
    readStoredProjects: () => store.stored,
    saveStoredProjects: (projects: Project[]) => { store.saved.push(projects); },
    syncProjectsToSession: async () => {},
}));

const DEFAULT_FILES = { "main.asm": DEFAULT_MAIN_SOURCE, "macro.asm": DEFAULT_MACRO_SOURCE };

describe("ProjectsPage default files", () => {
    afterEach(() => {
        store.stored = [];
        store.saved = [];
    });

    it("gives the first-visit project the syntax tour and the macro tour", async () => {
        render(<ProjectsPage />);

        await waitFor(() => expect(store.saved).toHaveLength(1));
        const [tour] = store.saved[0];
        expect(tour.name).toBe("SIC/XE Syntax Tour");
        expect(tour.files).toEqual(DEFAULT_FILES);
    });

    it("gives a new project the same two files", async () => {
        store.stored = [{ id: "kept", name: "Kept", architecture: "SIC/XE", files: { "a.asm": "" } }];
        const user = userEvent.setup();
        render(<ProjectsPage />);

        await user.click(await screen.findByRole("button", { name: "New project" }));
        await user.type(screen.getByLabelText("Project name"), "Fresh");
        await user.click(screen.getByRole("button", { name: "Create project" }));

        await waitFor(() => expect(store.saved).toHaveLength(1));
        const created = store.saved[0].find((project) => project.name === "Fresh");
        expect(created?.files).toEqual(DEFAULT_FILES);
        expect(store.saved[0].find((project) => project.id === "kept")?.files).toEqual({ "a.asm": "" });
    });
});
