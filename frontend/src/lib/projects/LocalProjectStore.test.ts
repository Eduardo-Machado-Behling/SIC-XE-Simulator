import { beforeEach, describe, expect, it } from "vitest";

import { ApiValidationError } from "@/lib/api/errors";
import { LocalProjectStore, PROJECTS_STORAGE_KEY } from "@/lib/projects/LocalProjectStore";

const A = "550e8400-e29b-41d4-a716-446655440000";
const B = "6f1c2d3e-4b5a-4c6d-8e7f-001122334455";

const hello = { id: A, name: "Hello", architecture: "SIC-XE" as const, files: { "main.asm": "END" } };

beforeEach(() => {
    localStorage.clear();
});

describe("LocalProjectStore", () => {
    it("starts empty", () => {
        expect(new LocalProjectStore().list()).toEqual([]);
    });

    it("persists projects in localStorage across instances", () => {
        new LocalProjectStore().put(hello);

        expect(new LocalProjectStore().get(A)).toEqual(hello);
        expect(new LocalProjectStore().list()).toEqual([hello]);
        expect(localStorage.getItem(PROJECTS_STORAGE_KEY)).toContain(A);
    });

    it("returns copies, so callers cannot mutate stored state by accident", () => {
        const store = new LocalProjectStore();
        store.put(hello);

        const copy = store.get(A)!;
        copy.files["main.asm"] = "changed";

        expect(store.get(A)!.files["main.asm"]).toBe("END");
    });

    it("writes and deletes single files", () => {
        const store = new LocalProjectStore();
        store.put(hello);

        store.writeFile(A, "src/data.asm", "WORD 1");
        store.writeFile(A, "main.asm", "LDA #1");
        expect(new LocalProjectStore().get(A)!.files).toEqual({ "main.asm": "LDA #1", "src/data.asm": "WORD 1" });

        store.removeFile(A, "main.asm");
        expect(new LocalProjectStore().get(A)!.files).toEqual({ "src/data.asm": "WORD 1" });
    });

    it("removes projects", () => {
        const store = new LocalProjectStore();
        store.put(hello);
        store.put({ ...hello, id: B, name: "Other" });

        expect(store.remove(A)).toBe(true);
        expect(store.remove(A)).toBe(false);
        expect(new LocalProjectStore().list().map((p) => p.id)).toEqual([B]);
    });

    it.each([
        ["a non-UUID id", { ...hello, id: "0" }],
        ["an unknown architecture", { ...hello, architecture: "sic-xe" }],
        ["an empty name", { ...hello, name: "" }],
        ["a leading-slash file", { ...hello, files: { "/main.asm": "" } }],
    ])("refuses to store a project with %s", (_label, project) => {
        const store = new LocalProjectStore();

        expect(() => store.put(project as never)).toThrow(ApiValidationError);
        expect(store.list()).toEqual([]);
    });

    it("refuses invalid file paths and unknown projects on file writes", () => {
        const store = new LocalProjectStore();
        store.put(hello);

        expect(() => store.writeFile(A, "/abs.asm", "")).toThrow(ApiValidationError);
        expect(() => store.writeFile(A, "", "")).toThrow(ApiValidationError);
        expect(() => store.writeFile(B, "main.asm", "")).toThrow(/not stored/);
        expect(store.get(A)!.files).toEqual({ "main.asm": "END" });
    });

    it("skips invalid stored entries without deleting them", () => {
        localStorage.setItem(
            PROJECTS_STORAGE_KEY,
            JSON.stringify({ version: 1, projects: { [A]: hello, broken: { id: "broken", name: 3 } } }),
        );
        const store = new LocalProjectStore();

        expect(store.list()).toEqual([hello]);

        store.put({ ...hello, id: B, name: "Other" });
        expect(JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY)!).projects.broken).toEqual({ id: "broken", name: 3 });
    });

    it("keeps a backup instead of overwriting unreadable data", () => {
        localStorage.setItem(PROJECTS_STORAGE_KEY, "{not json");
        const store = new LocalProjectStore();

        expect(store.list()).toEqual([]);
        store.put(hello);

        expect(localStorage.getItem(`${PROJECTS_STORAGE_KEY}.corrupt`)).toBe("{not json");
        expect(store.list()).toEqual([hello]);
    });

    it("works in memory when there is no storage (server rendering)", () => {
        const store = new LocalProjectStore(() => undefined);

        store.put(hello);

        expect(store.get(A)).toEqual(hello);
        expect(localStorage.getItem(PROJECTS_STORAGE_KEY)).toBeNull();
    });

    it("notifies subscribers on change", () => {
        const store = new LocalProjectStore();
        let calls = 0;
        const unsubscribe = store.subscribe(() => {
            calls += 1;
        });

        store.put(hello);
        store.writeFile(A, "main.asm", "x");
        unsubscribe();
        store.remove(A);

        expect(calls).toBe(2);
    });
});
