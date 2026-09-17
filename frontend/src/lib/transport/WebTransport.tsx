import { LoadProjectResponse, SimulatorTransport } from "@/lib/transport/SimulatorTransport";
import { Project } from "@/lib/simulator/Project";
import { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";

type Request = {
    id: string;
    type: string;
    payload?: unknown;
};

type Response<T = unknown> = {
    id: string;
    result?: T;
    error?: string;
};

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
};

export class WebTransport implements SimulatorTransport {
    private socket: WebSocket | null = null;
    private connection: Promise<void> | null = null;

    private readonly httpUrl: string;
    private readonly wsUrl: string;

    private pending = new Map<string, PendingRequest>();

    constructor(readonly baseUrl: string) {
        this.httpUrl = `http://${baseUrl}`;
        this.wsUrl = `ws://${baseUrl}/ws`;
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

        if (response.error) {
            pending.reject(
                new Error(response.error),
            );

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

    private async send<T>(message: string): Promise<T> {
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
            this.pending.set(id, {
                resolve: (value) => {
                    resolve(value as T);
                },
                reject,
            });

            const request: Request = {
                id,
                type: "command",
                payload: message,
            };

            socket.send(JSON.stringify(request));
        });
    }

    private async request<T>(
        path: string,
        options: RequestInit = {},
    ): Promise<T> {
        const response = await fetch(
            `${this.httpUrl}${path}`,
            {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...options.headers,
                },
            },
        );

        const text = await response.text();

        const body = text
            ? JSON.parse(text)
            : null;

        if (!response.ok) {
            throw new Error(
                body?.error ?? `HTTP ${response.status}`,
            );
        }

        return body as T;
    }

    async projects(): Promise<Project[]> {
        return this.request<Project[]>("/projects");
    }

    async createProject(
        newProject: Project,
    ): Promise<unknown> {
        return this.request("/project", {
            method: "PUT",
            body: JSON.stringify(newProject),
        });
    }

    async step(): Promise<ExecutionEvent[]> {
        return this.send<ExecutionEvent[]>("step");
    }

    async reset(): Promise<void> {
        await this.send<void>("reset");
    }

    async loadProject(
        projectId: string,
    ): Promise<LoadProjectResponse> {
        return this.send<LoadProjectResponse>(
            `load $${projectId}`,
        );
    }

    async loadFile(file: string): Promise<ArchitectureInfo>{
        return this.send<ArchitectureInfo>(
            `load %${file}`,
        );
    }

    async setFile(
        file: string,
        content: string,
    ): Promise<unknown> {
        return this.request(
            "/simulator/project/file",
            {
                method: "PUT",
                body: JSON.stringify({
                    filePath: file,
                    content,
                }),
            },
        );
    }
}