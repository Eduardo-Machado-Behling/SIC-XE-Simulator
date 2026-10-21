/**
 * Errors raised by the HTTP API client. Each keeps whatever the server said
 * (the RFC 9457-style `Error` object of api_spec/openapi.yaml) so callers can
 * tell an expired session from a missing project or file, a rejected request
 * or a broken connection.
 */

export class ApiError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = new.target.name;
    }
}

/** The server answered with a documented problem object. */
export class ApiProblemError extends ApiError {
    /** Status of the HTTP response. */
    readonly httpStatus: number;
    /** `status` from the problem body (the HTTP status if the body omits it). */
    readonly status: number;
    readonly title: string;
    readonly type?: string;
    readonly detail?: string;

    constructor(httpStatus: number, problem: { status?: number; title: string; type?: string; detail?: string }) {
        super(problem.detail ? `${problem.title}: ${problem.detail}` : problem.title);
        this.httpStatus = httpStatus;
        this.status = problem.status ?? httpStatus;
        this.title = problem.title;
        if (problem.type !== undefined) this.type = problem.type;
        if (problem.detail !== undefined) this.detail = problem.detail;
    }
}

/** The request never got an HTTP response (offline, DNS, CORS, server down). */
export class ApiNetworkError extends ApiError {
    constructor(cause: unknown) {
        super(`Could not reach the server${cause instanceof Error ? `: ${cause.message}` : ""}`, { cause });
    }
}

export type ApiResponseProblem = "malformed-json" | "invalid-shape" | "unexpected-status";

/** The server answered, but not in a way the contract allows. */
export class ApiResponseError extends ApiError {
    readonly httpStatus: number;
    readonly reason: ApiResponseProblem;
    readonly detail: string;

    constructor(httpStatus: number, reason: ApiResponseProblem, detail: string) {
        super(`Unexpected server response (HTTP ${httpStatus}, ${reason}): ${detail}`);
        this.httpStatus = httpStatus;
        this.reason = reason;
        this.detail = detail;
    }
}

/** The client refused to send a request the contract does not allow. */
export class ApiValidationError extends ApiError {
    readonly field: string;

    constructor(field: string, problem: string) {
        super(`${field}: ${problem}`);
        this.field = field;
    }
}

/**
 * True only for the documented session expiry: a 404 whose problem `type` is
 * `session-not-found`. Other 404s (`project-not-found`, `file-not-found`) are
 * not session problems and must not trigger recovery.
 */
export function isSessionNotFound(error: unknown): boolean {
    return error instanceof ApiProblemError && error.httpStatus === 404 && error.type === "session-not-found";
}

export function isProblemType(error: unknown, type: string): error is ApiProblemError {
    return error instanceof ApiProblemError && error.type === type;
}

export type ApiErrorKind =
    | "session-expired"
    | "project-not-found"
    | "file-not-found"
    | "invalid-request"
    | "payload-too-large"
    | "network"
    | "server"
    | "invalid-response"
    | "unknown";

/** A short classification and message for the UI. */
export function describeApiError(error: unknown): { kind: ApiErrorKind; message: string } {
    if (error instanceof ApiValidationError) {
        return { kind: "invalid-request", message: `Not saved: ${error.message}` };
    }
    if (error instanceof ApiProblemError) {
        if (isSessionNotFound(error)) return { kind: "session-expired", message: "The server forgot this session." };
        if (error.type === "project-not-found") return { kind: "project-not-found", message: "The project does not exist on the server." };
        if (error.type === "file-not-found") return { kind: "file-not-found", message: "The file does not exist on the server." };
        if (error.httpStatus === 400) return { kind: "invalid-request", message: `The server rejected the request: ${error.message}` };
        if (error.httpStatus === 413) return { kind: "payload-too-large", message: "The project is too large for the server." };
        if (error.httpStatus >= 500) return { kind: "server", message: `Server error: ${error.message}` };
        return { kind: "unknown", message: error.message };
    }
    if (error instanceof ApiNetworkError) return { kind: "network", message: "The server is unreachable; changes are kept in this browser." };
    if (error instanceof ApiResponseError) {
        return error.httpStatus >= 500
            ? { kind: "server", message: `Server error (HTTP ${error.httpStatus}).` }
            : { kind: "invalid-response", message: error.message };
    }
    return { kind: "unknown", message: error instanceof Error ? error.message : String(error) };
}
