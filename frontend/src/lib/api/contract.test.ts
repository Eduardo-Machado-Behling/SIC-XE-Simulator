import { describe, expect, it } from "vitest";

import {
    ContractViolation,
    assertArchitecture,
    assertFilePath,
    assertProjectInput,
    assertProjectSyncItems,
    assertUuid,
    isUuid,
    parseApiProject,
    parseArchitectures,
    parseProjectSummaries,
    parseSession,
} from "@/lib/api/contract";
import { ApiValidationError } from "@/lib/api/errors";

const SESSION = "3f2b8c1e-7a4d-4e9b-9c55-1d2a6b0f8e33";
const PROJECT = "550e8400-e29b-41d4-a716-446655440000";

describe("UUID validation", () => {
    it("accepts canonical UUIDs in either case", () => {
        expect(isUuid(SESSION)).toBe(true);
        expect(isUuid(PROJECT.toUpperCase())).toBe(true);
    });

    it.each([
        "",
        "0",
        "550e8400e29b41d4a716446655440000",
        "550e8400-e29b-41d4-a716-44665544000",
        "550e8400-e29b-41d4-a716-4466554400000",
        "550e8400-e29b-41d4-a716-44665544000g",
        "{550e8400-e29b-41d4-a716-446655440000}",
        " 550e8400-e29b-41d4-a716-446655440000",
    ])("rejects %j", (value) => {
        expect(isUuid(value)).toBe(false);
        expect(() => assertUuid(value, "projectId")).toThrow(ApiValidationError);
    });

    it("names the offending field", () => {
        expect(() => assertUuid("0", "projectId")).toThrow(/projectId/);
    });
});

describe("architecture validation", () => {
    it("accepts exactly the documented identifiers", () => {
        expect(() => assertArchitecture("SIC")).not.toThrow();
        expect(() => assertArchitecture("SIC-XE")).not.toThrow();
    });

    it.each(["sic-xe", "SICXE", "sic", "", "x86"])("rejects %j", (value) => {
        expect(() => assertArchitecture(value)).toThrow(ApiValidationError);
    });
});

describe("file path validation", () => {
    it.each(["main.asm", "src/main.asm", "a", "with space.asm", "ção.asm"])("accepts %j", (path) => {
        expect(() => assertFilePath(path)).not.toThrow();
    });

    it.each(["", "/main.asm", "/", "a\nb"])("rejects %j", (path) => {
        expect(() => assertFilePath(path)).toThrow(ApiValidationError);
    });
});

describe("request bodies", () => {
    const input = { name: "Hello", architecture: "SIC-XE", files: { "main.asm": "END" } };

    it("accepts a valid ProjectInput", () => {
        expect(() => assertProjectInput(input)).not.toThrow();
    });

    it.each([
        ["an empty name", { ...input, name: "" }],
        ["a missing name", { architecture: "SIC", files: {} }],
        ["an unknown architecture", { ...input, architecture: "sic-xe" }],
        ["a leading-slash file", { ...input, files: { "/main.asm": "" } }],
        ["an empty file path", { ...input, files: { "": "" } }],
        ["non-string content", { ...input, files: { "main.asm": 1 } }],
        ["files that are not an object", { ...input, files: ["main.asm"] }],
    ])("rejects %s", (_label, body) => {
        expect(() => assertProjectInput(body)).toThrow(ApiValidationError);
    });

    it("requires a UUID id and unique ids in a sync list", () => {
        expect(() => assertProjectSyncItems([{ ...input, id: PROJECT }])).not.toThrow();
        expect(() => assertProjectSyncItems([])).not.toThrow();
        expect(() => assertProjectSyncItems([{ ...input, id: "0" }])).toThrow(ApiValidationError);
        expect(() => assertProjectSyncItems([{ ...input, id: PROJECT }, { ...input, id: PROJECT }])).toThrow(/duplicate/);
    });
});

describe("response parsing", () => {
    it("parses a Session", () => {
        expect(parseSession({ sessionId: SESSION })).toEqual({ sessionId: SESSION });
    });

    it.each([null, {}, { sessionId: "abc" }, { sessionId: 1 }, [SESSION]])("rejects the Session %j", (body) => {
        expect(() => parseSession(body)).toThrow(ContractViolation);
    });

    it("parses ProjectSummary[] and does not invent file contents", () => {
        const summaries = parseProjectSummaries([
            { id: PROJECT, name: "Hello", architecture: "SIC", updatedAt: "2026-10-20T12:00:00.000Z" },
        ]);

        expect(summaries).toEqual([
            { id: PROJECT, name: "Hello", architecture: "SIC", updatedAt: "2026-10-20T12:00:00.000Z" },
        ]);
        expect("files" in summaries[0]).toBe(false);
    });

    it.each([
        ["a non-array", { id: PROJECT }],
        ["a bad id", [{ id: "1", name: "a", architecture: "SIC", updatedAt: "2026-10-20T12:00:00Z" }]],
        ["a bad architecture", [{ id: PROJECT, name: "a", architecture: "sic", updatedAt: "2026-10-20T12:00:00Z" }]],
        ["a bad timestamp", [{ id: PROJECT, name: "a", architecture: "SIC", updatedAt: "yesterday" }]],
        ["a missing name", [{ id: PROJECT, architecture: "SIC", updatedAt: "2026-10-20T12:00:00Z" }]],
    ])("rejects summaries with %s", (_label, body) => {
        expect(() => parseProjectSummaries(body)).toThrow(ContractViolation);
    });

    it("parses a Project with its files", () => {
        const project = {
            id: PROJECT,
            name: "Hello",
            architecture: "SIC-XE",
            updatedAt: "2026-10-20T12:00:00+00:00",
            files: { "main.asm": "END", "src/data.asm": "WORD 1" },
        };

        expect(parseApiProject(project)).toEqual(project);
        expect(() => parseApiProject({ ...project, files: undefined })).toThrow(ContractViolation);
        expect(() => parseApiProject({ ...project, files: { "/abs.asm": "" } })).toThrow(ContractViolation);
    });

    it("parses the architecture identifier list", () => {
        expect(parseArchitectures(["SIC", "SIC-XE"])).toEqual(["SIC", "SIC-XE"]);
        expect(() => parseArchitectures(["SIC", "MIPS"])).toThrow(ContractViolation);
        expect(() => parseArchitectures("SIC")).toThrow(ContractViolation);
    });
});
