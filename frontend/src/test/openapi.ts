/**
 * Test-only helpers that read the real OpenAPI document (api_spec/openapi.yaml
 * at the repository root) and derive from it:
 *
 * - a JSON Schema validator for the subset of keywords the document uses;
 * - sample values built from each schema's own `example(s)`;
 * - a `fetch` double that only answers documented operations, checks path,
 *   query and body against the document, and replies with documented
 *   statuses and bodies.
 *
 * Nothing here is hand-copied from the client under test, so drift between
 * the client and the document shows up as a failing test.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/* eslint-disable @typescript-eslint/no-explicit-any -- the document is untyped YAML */
export type Schema = Record<string, any>;
export type OpenApiDocument = Record<string, any>;

// A string, not new URL(): under jsdom the global URL is not Node's.
export const SPEC_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../../api_spec/openapi.yaml");

export function loadSpec(): OpenApiDocument {
    return parse(readFileSync(SPEC_PATH, "utf8"));
}

export const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options"] as const;

export type SpecOperation = {
    operationId: string;
    method: string; // upper case
    path: string; // template, e.g. /sessions/{sessionId}
    operation: Schema;
    parameters: Schema[];
};

export function listOperations(spec: OpenApiDocument): SpecOperation[] {
    const result: SpecOperation[] = [];

    for (const [path, item] of Object.entries<Schema>(spec.paths)) {
        for (const method of HTTP_METHODS) {
            const operation = item[method];
            if (!operation) continue;

            const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])].map((p: Schema) =>
                deref(spec, p),
            );
            result.push({ operationId: operation.operationId, method: method.toUpperCase(), path, operation, parameters });
        }
    }

    return result;
}

export function deref(spec: OpenApiDocument, node: Schema): Schema {
    let current = node;
    while (current && typeof current.$ref === "string") {
        const ref: string = current.$ref;
        if (!ref.startsWith("#/")) throw new Error(`external $ref not supported: ${ref}`);
        current = ref
            .slice(2)
            .split("/")
            .reduce<any>((acc, key) => acc?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], spec);
        if (!current) throw new Error(`unresolved $ref ${ref}`);
    }
    return current;
}

// ------------------------------------------------------------------ validation

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

type ValidateOptions = { strict?: boolean };

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function declaredProperties(spec: OpenApiDocument, schema: Schema): Set<string> {
    const s = deref(spec, schema);
    const names = new Set<string>(Object.keys(s.properties ?? {}));
    for (const member of s.allOf ?? []) {
        for (const name of declaredProperties(spec, member)) names.add(name);
    }
    return names;
}

/**
 * Returns a list of violations (empty when `value` conforms). With
 * `strict`, objects may not carry properties their schema does not declare
 * (used for request bodies, where an extra field means the client sent
 * something the contract does not know about).
 */
export function validate(
    spec: OpenApiDocument,
    schema: Schema,
    value: unknown,
    at = "$",
    options: ValidateOptions = {},
): string[] {
    const s = deref(spec, schema);
    const errors: string[] = [];

    if (s.allOf) {
        for (const member of s.allOf) errors.push(...validate(spec, member, value, at, { strict: false }));
        if (options.strict && isPlainObject(value)) {
            const allowed = declaredProperties(spec, s);
            for (const key of Object.keys(value)) {
                if (!allowed.has(key)) errors.push(`${at}.${key}: not declared by the schema`);
            }
        }
        return errors;
    }

    if (s.enum && !s.enum.includes(value)) {
        errors.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(s.enum)}`);
        return errors;
    }

    switch (s.type) {
        case "object": {
            if (!isPlainObject(value)) return [`${at}: expected object`];
            for (const key of s.required ?? []) {
                if (!(key in value)) errors.push(`${at}.${key}: required`);
            }
            const properties: Record<string, Schema> = s.properties ?? {};
            for (const [key, child] of Object.entries(value)) {
                if (s.propertyNames) {
                    errors.push(...validate(spec, s.propertyNames, key, `${at}[property name ${JSON.stringify(key)}]`));
                }
                if (key in properties) {
                    errors.push(...validate(spec, properties[key], child, `${at}.${key}`, options));
                } else if (isPlainObject(s.additionalProperties)) {
                    errors.push(...validate(spec, s.additionalProperties, child, `${at}[${JSON.stringify(key)}]`, options));
                } else if (s.additionalProperties === false || (options.strict && s.additionalProperties === undefined)) {
                    errors.push(`${at}.${key}: not declared by the schema`);
                }
            }
            return errors;
        }
        case "array": {
            if (!Array.isArray(value)) return [`${at}: expected array`];
            value.forEach((item, index) => errors.push(...validate(spec, s.items ?? {}, item, `${at}[${index}]`, options)));
            return errors;
        }
        case "string": {
            if (typeof value !== "string") return [`${at}: expected string`];
            if (s.minLength !== undefined && [...value].length < s.minLength) errors.push(`${at}: shorter than ${s.minLength}`);
            if (s.pattern && !new RegExp(s.pattern, "u").test(value)) errors.push(`${at}: does not match ${s.pattern}`);
            if (s.format === "uuid" && !UUID.test(value)) errors.push(`${at}: not a uuid`);
            if (s.format === "date-time" && !DATE_TIME.test(value)) errors.push(`${at}: not a date-time`);
            return errors;
        }
        case "integer":
            return Number.isInteger(value) ? errors : [`${at}: expected integer`];
        case "number":
            return typeof value === "number" ? errors : [`${at}: expected number`];
        case "boolean":
            return typeof value === "boolean" ? errors : [`${at}: expected boolean`];
        case undefined:
            return errors;
        default:
            throw new Error(`unsupported schema type ${s.type}`);
    }
}

// --------------------------------------------------------------------- samples

/** Builds a value for `schema` from the document's own examples. */
export function sample(spec: OpenApiDocument, schema: Schema): unknown {
    const s = deref(spec, schema);

    if (s.example !== undefined) return s.example;
    if (Array.isArray(s.examples) && s.examples.length > 0) return s.examples[0];
    if (s.allOf) return Object.assign({}, ...s.allOf.map((member: Schema) => sample(spec, member)));
    if (s.enum) return s.enum[0];

    switch (s.type) {
        case "object":
            return Object.fromEntries(
                Object.entries<Schema>(s.properties ?? {}).map(([key, child]) => [key, sample(spec, child)]),
            );
        case "array":
            return [sample(spec, s.items ?? {})];
        case "string":
            if (s.format === "uuid") return "00000000-0000-4000-8000-000000000000";
            if (s.format === "date-time") return "2026-01-01T00:00:00Z";
            return "sample";
        case "integer":
        case "number":
            return 0;
        case "boolean":
            return false;
        default:
            return null;
    }
}

// ------------------------------------------------------------------- spec fetch

export type RecordedRequest = {
    operationId: string;
    method: string;
    url: string;
    pathParams: Record<string, string>;
    query: URLSearchParams;
    body: unknown;
};

export type SpecFetchOptions = {
    baseUrl: string;
    /** Status to answer per operation; defaults to the first documented 2xx. */
    statusFor?: (operationId: string) => number | undefined;
};

function pathRegex(template: string): { regex: RegExp; names: string[] } {
    const names: string[] = [];
    const source = template.replace(/[.*+?^${}()|[\]\\]/g, (char) => (char === "{" || char === "}" ? char : `\\${char}`));
    const pattern = source.replace(/\{([^}]+)\}/g, (_match, name: string) => {
        names.push(name);
        return "([^/]+)";
    });
    return { regex: new RegExp(`^${pattern}$`), names };
}

function mediaSchema(spec: OpenApiDocument, response: Schema): { schema?: Schema; example?: unknown } {
    const r = deref(spec, response);
    const media = r.content?.["application/json"];
    return { schema: media?.schema, example: media?.example };
}

/**
 * A fetch double backed by the OpenAPI document. Requests that do not match a
 * documented operation, or that break its parameter/body schemas, are
 * recorded in `violations` and answered with a 599 so the caller fails too.
 */
export function createSpecFetch(spec: OpenApiDocument, options: SpecFetchOptions) {
    const operations = listOperations(spec).map((op) => ({ ...op, ...pathRegex(op.path) }));
    const requests: RecordedRequest[] = [];
    const violations: string[] = [];

    const fail = (message: string) => {
        violations.push(message);
        return new Response(JSON.stringify({ status: 599, title: message }), { status: 599 });
    };

    const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
        const method = (init.method ?? "GET").toUpperCase();
        const url = new URL(String(input));
        const base = new URL(options.baseUrl);

        if (url.origin !== base.origin) return fail(`${method} ${url}: wrong server`);
        const path = url.pathname.slice(base.pathname.replace(/\/$/, "").length);

        const op = operations.find((candidate) => candidate.method === method && candidate.regex.test(path));
        if (!op) return fail(`${method} ${path}: not a documented operation`);

        const match = op.regex.exec(path)!;
        const pathParams = Object.fromEntries(op.names.map((name, i) => [name, decodeURIComponent(match[i + 1])]));
        const where = `${op.operationId}`;

        for (const parameter of op.parameters) {
            if (parameter.in === "path") {
                const errors = validate(spec, parameter.schema, pathParams[parameter.name], `path.${parameter.name}`);
                if (errors.length) return fail(`${where}: ${errors.join("; ")}`);
            }
            if (parameter.in === "query") {
                const values = url.searchParams.getAll(parameter.name);
                if (parameter.required && values.length !== 1) return fail(`${where}: query.${parameter.name} required once`);
                for (const value of values) {
                    const errors = validate(spec, parameter.schema, value, `query.${parameter.name}`);
                    if (errors.length) return fail(`${where}: ${errors.join("; ")}`);
                }
            }
        }
        const declaredQuery = new Set(op.parameters.filter((p) => p.in === "query").map((p) => p.name));
        for (const name of url.searchParams.keys()) {
            if (!declaredQuery.has(name)) return fail(`${where}: undeclared query parameter ${name}`);
        }

        let body: unknown = undefined;
        const requestBody = op.operation.requestBody ? deref(spec, op.operation.requestBody) : undefined;
        if (requestBody) {
            if (typeof init.body !== "string") return fail(`${where}: missing JSON body`);
            const contentType = new Headers(init.headers).get("Content-Type") ?? "";
            if (!contentType.startsWith("application/json")) return fail(`${where}: Content-Type ${contentType}`);
            try {
                body = JSON.parse(init.body);
            } catch {
                return fail(`${where}: body is not JSON`);
            }
            const errors = validate(spec, requestBody.content["application/json"].schema, body, "body", { strict: true });
            if (errors.length) return fail(`${where}: ${errors.join("; ")}`);
        } else if (init.body !== undefined && init.body !== null) {
            return fail(`${where}: operation documents no request body`);
        }

        requests.push({ operationId: op.operationId, method, url: url.toString(), pathParams, query: url.searchParams, body });

        const documented = Object.keys(op.operation.responses).map(Number);
        const status = options.statusFor?.(op.operationId) ?? documented.find((code) => code >= 200 && code < 300)!;
        if (!documented.includes(status)) return fail(`${where}: test asked for undocumented status ${status}`);

        const { schema, example } = mediaSchema(spec, op.operation.responses[String(status)]);
        if (!schema) return new Response(null, { status });

        const payload = example ?? sample(spec, schema);
        const errors = validate(spec, schema, payload, "sample");
        if (errors.length) return fail(`${where}: generated sample is invalid: ${errors.join("; ")}`);

        return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
    };

    return { fetch: fetch as typeof globalThis.fetch, requests, violations };
}
