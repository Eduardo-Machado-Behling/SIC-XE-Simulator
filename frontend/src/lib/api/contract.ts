/**
 * Types and boundary checks for the HTTP contract in api_spec/openapi.yaml
 * (version 0.4.0). Requests are checked before they are sent
 * (ApiValidationError); responses are checked before they are trusted
 * (ContractViolation, turned into ApiResponseError by the client).
 */
import { ApiValidationError } from "@/lib/api/errors";

export const ARCHITECTURES = ["SIC", "SIC-XE"] as const;

/** `Architecture`: CPU architecture identifier. */
export type Architecture = (typeof ARCHITECTURES)[number];

/** `FilePath`: relative to the project root, nonempty, no leading slash. */
export type FilePath = string;

/** `Session` */
export interface Session {
    sessionId: string;
}

/** `ProjectInput`: client-supplied fields of a project (the id goes in the path). */
export interface ProjectInput {
    name: string;
    architecture: Architecture;
    files: Record<FilePath, string>;
}

/** `ProjectSyncItem`: a project with its client-generated id, for bulk sync. */
export interface ProjectSyncItem extends ProjectInput {
    id: string;
}

/** `ProjectSummary`: no file contents. */
export interface ProjectSummary {
    id: string;
    name: string;
    architecture: Architecture;
    updatedAt: string;
}

/** `Project`: a stored project including its files. */
export interface ApiProject extends ProjectInput, ProjectSummary {}

/** `FileSync` */
export interface FileSync {
    path: FilePath;
    content: string;
}

/** `Error` */
export interface ProblemDetails {
    type?: string;
    status: number;
    title: string;
    detail?: string;
}

export interface Health {
    status: "ok";
}

// ------------------------------------------------------------------ primitives

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `FilePath.pattern` with ECMA-262 semantics, as JSON Schema specifies. */
const FILE_PATH = /^[^/].*$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

export function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID.test(value);
}

export function isArchitecture(value: unknown): value is Architecture {
    return typeof value === "string" && (ARCHITECTURES as readonly string[]).includes(value);
}

/** Why `value` is not a valid `FilePath`, or null when it is. */
export function filePathProblem(value: unknown): string | null {
    if (typeof value !== "string") return "must be a string";
    if (value.length === 0) return "must not be empty";
    if (value.startsWith("/")) return "must not start with '/'";
    if (!FILE_PATH.test(value)) return "must not contain line breaks";
    return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --------------------------------------------------------- request validation

export function assertUuid(value: unknown, field: string): asserts value is string {
    if (!isUuid(value)) throw new ApiValidationError(field, `must be a UUID, got ${JSON.stringify(value)}`);
}

export function assertArchitecture(value: unknown, field = "architecture"): asserts value is Architecture {
    if (!isArchitecture(value)) {
        throw new ApiValidationError(field, `must be one of ${ARCHITECTURES.join(", ")}, got ${JSON.stringify(value)}`);
    }
}

export function assertFilePath(value: unknown, field = "path"): asserts value is FilePath {
    const problem = filePathProblem(value);
    if (problem) throw new ApiValidationError(field, `${problem} (got ${JSON.stringify(value)})`);
}

function assertFiles(value: unknown, field: string): asserts value is Record<FilePath, string> {
    if (!isPlainObject(value)) throw new ApiValidationError(field, "must be an object of path -> content");
    for (const [path, content] of Object.entries(value)) {
        assertFilePath(path, `${field} path`);
        if (typeof content !== "string") throw new ApiValidationError(`${field}[${JSON.stringify(path)}]`, "content must be a string");
    }
}

export function assertProjectInput(value: unknown, field = "project"): asserts value is ProjectInput {
    if (!isPlainObject(value)) throw new ApiValidationError(field, "must be an object");
    if (typeof value.name !== "string" || value.name.length === 0) throw new ApiValidationError(`${field}.name`, "must be a nonempty string");
    assertArchitecture(value.architecture, `${field}.architecture`);
    assertFiles(value.files, `${field}.files`);
}

export function assertProjectSyncItems(value: unknown): asserts value is ProjectSyncItem[] {
    if (!Array.isArray(value)) throw new ApiValidationError("projects", "must be an array");
    const seen = new Set<string>();
    value.forEach((item, index) => {
        assertProjectInput(item, `projects[${index}]`);
        const id = (item as { id?: unknown }).id;
        assertUuid(id, `projects[${index}].id`);
        const key = id.toLowerCase();
        if (seen.has(key)) throw new ApiValidationError(`projects[${index}].id`, `duplicate project id ${id}`);
        seen.add(key);
    });
}

export function assertFileSync(value: unknown): asserts value is FileSync {
    if (!isPlainObject(value)) throw new ApiValidationError("file", "must be an object");
    assertFilePath(value.path, "file.path");
    if (typeof value.content !== "string") throw new ApiValidationError("file.content", "must be a string");
}

/** Copies only the fields of a `ProjectInput` (drops `id` and anything else). */
export function toProjectInput(project: ProjectInput): ProjectInput {
    return { name: project.name, architecture: project.architecture, files: { ...project.files } };
}

/** Copies only the fields of a `ProjectSyncItem`. */
export function toProjectSyncItem(project: ProjectSyncItem): ProjectSyncItem {
    return { id: project.id, ...toProjectInput(project) };
}

// -------------------------------------------------------- response validation

/** A response body that does not match the documented schema. */
export class ContractViolation extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ContractViolation";
    }
}

function expectObject(value: unknown, at: string): Record<string, unknown> {
    if (!isPlainObject(value)) throw new ContractViolation(`${at}: expected an object`);
    return value;
}

function expectArray(value: unknown, at: string): unknown[] {
    if (!Array.isArray(value)) throw new ContractViolation(`${at}: expected an array`);
    return value;
}

function expectString(value: unknown, at: string): string {
    if (typeof value !== "string") throw new ContractViolation(`${at}: expected a string`);
    return value;
}

function expectUuid(value: unknown, at: string): string {
    if (!isUuid(value)) throw new ContractViolation(`${at}: expected a UUID`);
    return value;
}

function expectArchitecture(value: unknown, at: string): Architecture {
    if (!isArchitecture(value)) throw new ContractViolation(`${at}: unknown architecture ${JSON.stringify(value)}`);
    return value;
}

export function parseHealth(body: unknown): Health {
    const object = expectObject(body, "health");
    if (object.status !== "ok") throw new ContractViolation("health.status: expected \"ok\"");
    return { status: "ok" };
}

export function parseArchitectures(body: unknown): Architecture[] {
    return expectArray(body, "architectures").map((item, index) => expectArchitecture(item, `architectures[${index}]`));
}

export function parseSession(body: unknown): Session {
    const object = expectObject(body, "session");
    return { sessionId: expectUuid(object.sessionId, "session.sessionId") };
}

function parseSummaryFields(object: Record<string, unknown>, at: string): ProjectSummary {
    const updatedAt = expectString(object.updatedAt, `${at}.updatedAt`);
    if (!DATE_TIME.test(updatedAt)) throw new ContractViolation(`${at}.updatedAt: expected an RFC 3339 date-time`);
    return {
        id: expectUuid(object.id, `${at}.id`),
        name: expectString(object.name, `${at}.name`),
        architecture: expectArchitecture(object.architecture, `${at}.architecture`),
        updatedAt,
    };
}

export function parseProjectSummaries(body: unknown): ProjectSummary[] {
    return expectArray(body, "projects").map((item, index) =>
        parseSummaryFields(expectObject(item, `projects[${index}]`), `projects[${index}]`),
    );
}

export function parseApiProject(body: unknown): ApiProject {
    const object = expectObject(body, "project");
    const summary = parseSummaryFields(object, "project");
    const rawFiles = expectObject(object.files, "project.files");
    const files: Record<FilePath, string> = {};
    for (const [path, content] of Object.entries(rawFiles)) {
        const problem = filePathProblem(path);
        if (problem) throw new ContractViolation(`project.files: path ${JSON.stringify(path)} ${problem}`);
        files[path] = expectString(content, `project.files[${JSON.stringify(path)}]`);
    }
    return { ...summary, files };
}

/** Reads a problem object leniently: keeps every documented field present. */
export function parseProblem(body: unknown): Partial<ProblemDetails> & { title: string } | null {
    if (!isPlainObject(body) || typeof body.title !== "string") return null;
    const problem: Partial<ProblemDetails> & { title: string } = { title: body.title };
    if (Number.isInteger(body.status)) problem.status = body.status as number;
    if (typeof body.type === "string") problem.type = body.type;
    if (typeof body.detail === "string") problem.detail = body.detail;
    return problem;
}
