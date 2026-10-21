import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectsHome } from "@/components/ProjectsHome";
import { SimulatorApiClient } from "@/lib/api/SimulatorApiClient";
import { LocalProjectStore } from "@/lib/projects/LocalProjectStore";
import { ProjectSync } from "@/lib/projects/ProjectSync";
import { createMemorySessionStore } from "@/lib/session/sessionCookie";
import type { Project } from "@/lib/simulator/Project";
import { FakeBackend } from "@/test/fakeBackend";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const A = "550e8400-e29b-41d4-a716-446655440000";
const NEW_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const hello: Project = { id: A, name: "Hello", architecture: "SIC-XE", files: { "main.asm": "END" } };

function setup(projects: Project[] = []) {
    const backend = new FakeBackend();
    const store = new LocalProjectStore(() => undefined);
    projects.forEach((project) => store.put(project));
    const session = createMemorySessionStore();
    const sync = new ProjectSync({
        api: new SimulatorApiClient({ baseUrl: backend.baseUrl, fetch: backend.fetch }),
        store,
        session,
        generateId: () => NEW_ID,
        fileDebounceMs: 0,
    });
    return { backend, store, session, sync };
}

afterEach(() => {
    push.mockReset();
    vi.restoreAllMocks();
});

describe("ProjectsHome", () => {
    it("lists the projects stored in this browser and syncs them to a new session", async () => {
        const { backend, session, sync } = setup([hello]);

        render(<ProjectsHome sync={sync} />);

        expect(screen.getByRole("heading", { name: "Hello" })).toBeTruthy();
        await waitFor(() => expect(backend.requests(/sessions/)).toEqual(["POST /sessions", `PUT /sessions/${session.read()}/projects`]));
    });

    it("creates a project with the chosen name and architecture and opens it", async () => {
        const user = userEvent.setup();
        const { backend, store, session, sync } = setup();
        render(<ProjectsHome sync={sync} />);

        await user.type(screen.getByLabelText("Project name"), "Fibonacci");
        await user.selectOptions(screen.getByLabelText("Architecture"), "SIC");
        await user.click(screen.getByRole("button", { name: "Create project" }));

        expect(store.get(NEW_ID)).toEqual({ id: NEW_ID, name: "Fibonacci", architecture: "SIC", files: { "main.asm": "" } });
        expect(push).toHaveBeenCalledWith(`/editor/${NEW_ID}/`);
        await waitFor(() => expect(backend.projectsOf(session.read()!)[NEW_ID]?.name).toBe("Fibonacci"));
    });

    it("does not create a project without a name", async () => {
        const user = userEvent.setup();
        const { store, sync } = setup();
        render(<ProjectsHome sync={sync} />);

        await user.click(screen.getByRole("button", { name: "Create project" }));

        expect(store.list()).toEqual([]);
        expect(push).not.toHaveBeenCalled();
    });

    it("deletes a project after confirmation, locally and on the server", async () => {
        const user = userEvent.setup();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        const { backend, store, session, sync } = setup([hello]);
        render(<ProjectsHome sync={sync} />);
        await waitFor(() => expect(backend.projectsOf(session.read() ?? "")[A]).toBeTruthy());

        await user.click(screen.getByRole("button", { name: "Delete project Hello" }));

        expect(screen.queryByRole("heading", { name: "Hello" })).toBeNull();
        expect(store.list()).toEqual([]);
        await waitFor(() => expect(backend.projectsOf(session.read()!)).toEqual({}));
    });

    it("keeps a project when deletion is not confirmed", async () => {
        const user = userEvent.setup();
        vi.spyOn(window, "confirm").mockReturnValue(false);
        const { store, sync } = setup([hello]);
        render(<ProjectsHome sync={sync} />);

        await user.click(screen.getByRole("button", { name: "Delete project Hello" }));

        expect(store.list()).toEqual([hello]);
    });

    it("says when the server is unreachable while still listing local projects", async () => {
        const { backend, sync } = setup([hello]);
        backend.online = false;

        render(<ProjectsHome sync={sync} />);

        const status = await screen.findByRole("status");
        await waitFor(() => expect(status.textContent).toMatch(/unreachable/i));
        expect(within(status).getByText(/kept in this browser/i)).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Hello" })).toBeTruthy();
    });

    it("marks the architectures the server cannot run, while still offering every documented one", async () => {
        const { backend, sync } = setup();
        backend.architectures = ["SIC-XE"];

        render(<ProjectsHome sync={sync} />);

        const select = screen.getByLabelText("Architecture");
        await waitFor(() =>
            expect(within(select).getByRole("option", { name: "SIC (not available on this server)" })).toBeTruthy(),
        );
        expect(within(select).getByRole("option", { name: "SIC-XE" })).toBeTruthy();
        expect(backend.requests(/architectures/)).toEqual(["GET /simulator/architectures"]);
    });

    it("lists every documented architecture unmarked when the server cannot be asked", async () => {
        const { backend, sync } = setup();
        backend.online = false;

        render(<ProjectsHome sync={sync} />);

        await screen.findByRole("status");
        const select = screen.getByLabelText("Architecture");
        expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["SIC", "SIC-XE"]);
    });
});
