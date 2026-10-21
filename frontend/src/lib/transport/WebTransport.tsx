import {
    LoadProjectResponse,
    SimulatorCommandError,
    SimulatorProblem,
    SimulatorTransport,
} from "@/lib/transport/SimulatorTransport";
import { ExecutionEvent, normalizeExecutionEvents } from "@/lib/simulator/ExecutionEvent";
import { toWebSocketUrl } from "@/lib/api/config";

type Request = {
    id: string;
    type: string;
    payload?: unknown;
};

type Response<T = unknown> = {
    id: string;
    result?: T;
    error?: string | (SimulatorProblem & { events?: unknown });
};

type EventBatchResponse = {
    events: unknown;
    from: number;
    to: number;
};

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
};

export type WebTransportOptions = {
    /** How long a project load may stay unanswered before it fails. Default 8 s. */
    loadTimeoutMs?: number;
};

export class WebTransport implements SimulatorTransport {
    private socket: WebSocket | null = null;
    private connection: Promise<void> | null = null;

    private readonly wsUrl: string;
    private readonly loadTimeoutMs: number;

    private pending = new Map<string, PendingRequest>();

    private normalizeEventBatch(batch: unknown): ExecutionEvent[] {
        if (
            !batch ||
            typeof batch !== "object" ||
            !Array.isArray((batch as EventBatchResponse).events) ||
            !Number.isInteger((batch as EventBatchResponse).from) ||
            !Number.isInteger((batch as EventBatchResponse).to)
        ) {
            throw new TypeError("Invalid execution event batch response");
        }

        return normalizeExecutionEvents((batch as EventBatchResponse).events);
    }

    /** @param baseUrl backend base URL, e.g. http://localhost:8080 (see src/lib/api/config.ts) */
    constructor(readonly baseUrl: string, options: WebTransportOptions = {}) {
        this.wsUrl = toWebSocketUrl(baseUrl);
        this.loadTimeoutMs = options.loadTimeoutMs ?? 8_000;
    }

    async connect(): Promise<void> {
        // Already connected.
        if (this.socket?.readyState === WebSocket.OPEN) {
            return;
        }

        // Another caller is already establishing the connection.
        // Reuse that promise instead of creating another WebSocket.
        if (this.connection) {
            return this.connection;
        }

        this.connection = new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(this.wsUrl);

            this.socket = socket;

            socket.onopen = () => {
                if (this.socket !== socket) {
                    return;
                }

                this.connection = null;
                resolve();
            };

            socket.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            socket.onerror = () => {
                if (this.socket === socket) {
                    this.socket = null;
                }

                this.connection = null;

                reject(
                    new Error("Failed to connect to simulator"),
                );
            };

            socket.onclose = () => {
                if (this.socket !== socket) {
                    return;
                }

                this.socket = null;
                this.connection = null;

                this.rejectPending(
                    new Error("Simulator connection closed"),
                );
            };
        });

        return this.connection;
    }

    disconnect(): void {
        const socket = this.socket;

        this.socket = null;
        this.connection = null;

        if (socket) {
            socket.close();
        }

        this.rejectPending(
            new Error("Simulator disconnected"),
        );
    }


    private handleMessage(data: string): void {
        let response: Response;

        try {
            response = JSON.parse(data) as Response;
        } catch {
            console.error(
                "Invalid WebSocket response:",
                data,
            );
            return;
        }

        const pending = this.pending.get(response.id);

        if (!pending) {
            console.warn(
                `Received response for unknown request: ${response.id}`,
            );
            return;
        }

        this.pending.delete(response.id);

        if (typeof response.error === "string") {
            pending.reject(new Error(response.error));
            return;
        }

        if (response.error) {
            const { events: rawEvents, ...problem } = response.error;
            let events: ExecutionEvent[] | null = null;
            if (Array.isArray(rawEvents)) {
                try {
                    events = normalizeExecutionEvents(rawEvents);
                } catch (error) {
                    console.error("Invalid events attached to simulator error:", error);
                }
            }
            pending.reject(new SimulatorCommandError(problem, events));
            return;
        }

        pending.resolve(response.result);
    }

    private rejectPending(error: Error): void {
        for (const { reject } of this.pending.values()) {
            reject(error);
        }

        this.pending.clear();
    }

    private async send<T>(message: string, timeoutMs?: number): Promise<T> {
        await this.connect();

        const socket = this.socket;

        if (
            !socket ||
            socket.readyState !== WebSocket.OPEN
        ) {
            throw new Error(
                "Simulator is not connected",
            );
        }

        const id = crypto.randomUUID();

        return new Promise<T>((resolve, reject) => {
            const timer = timeoutMs === undefined
                ? null
                : setTimeout(() => {
                    this.pending.delete(id);
                    reject(new Error(`Simulator did not answer "${message}" within ${timeoutMs / 1000} s`));
                }, timeoutMs);
            const settle = () => {
                if (timer) clearTimeout(timer);
            };

            this.pending.set(id, {
                resolve: (value) => {
                    settle();
                    resolve(value as T);
                },
                reject: (reason) => {
                    settle();
                    reject(reason);
                },
            });

            const request: Request = {
                id,
                type: "command",
                payload: message,
            };

            socket.send(JSON.stringify(request));
        });
    }

    async step(): Promise<ExecutionEvent[]> {
        return normalizeExecutionEvents(await this.send<unknown>("step"));
    }

    async reset(): Promise<ExecutionEvent[]> {
        return this.normalizeEventBatch(await this.send<unknown>("reset"));
    }

    async clear(): Promise<ExecutionEvent[]> {
        return this.normalizeEventBatch(await this.send<unknown>("clear"));
    }

    async loadProject(
        projectId: string,
    ): Promise<LoadProjectResponse> {
        return this.send<LoadProjectResponse>(
            `load $${projectId}`,
            this.loadTimeoutMs,
        );
    }

    async loadFile(file: string): Promise<ExecutionEvent[]> {
        const batch = await this.send<unknown>(
            `load %${file}`,
        );
        return this.normalizeEventBatch(batch);
    }
}
