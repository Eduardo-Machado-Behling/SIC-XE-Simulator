import { SimulatorTransport } from "@/lib/transport/SimulatorTransport";

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

import { Project } from "@/lib/simulator/Project";

export class WebTransport implements SimulatorTransport {
    private socket: WebSocket | null = null;

    private readonly httpUrl: string;
    private readonly wsUrl: string;

    private pending = new Map<
        string,
        {
            resolve: (value: unknown) => void;
            reject: (reason?: unknown) => void;
        }
    >();

    constructor(readonly baseUrl: string) {
        this.httpUrl = `http://${baseUrl}`;
        this.wsUrl = `ws://${baseUrl}/ws`;
    }

    async connect(): Promise<void> {
        if (this.socket?.readyState === WebSocket.OPEN) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(this.wsUrl);

            socket.onopen = () => {
                this.socket = socket;
                resolve();
            };

            socket.onerror = () => {
                reject(new Error("Failed to connect to simulator"));
            };

            socket.onclose = () => {
                if (this.socket === socket) {
                    this.socket = null;
                }
            };
        });
    }

    disconnect(): void {
        this.socket?.close();
        this.socket = null;
    }

    private async request<T>(
        path: string,
        options: RequestInit = {},
    ): Promise<T> {
        const response = await fetch(`${this.httpUrl}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
        });

        const text = await response.text();

        const body = text
            ? JSON.parse(text)
            : null;

        if (!response.ok) {
            throw new Error(
                body?.error ?? `HTTP ${response.status}`
            );
        }

        return body as T;
    }

    async projects(): Promise<Project[]> {
        return this.request<Project[]>("/projects");
    }

    async createProject(newProject: Project): Promise<unknown> {
        return this.request("/project", {
            method: "PUT",
            body: JSON.stringify(newProject),
        });
    }

    private send<T>(message: string): Promise<T> {
        if (
            !this.socket ||
            this.socket.readyState !== WebSocket.OPEN
        ) {
            return Promise.reject(
                new Error("Simulator is not connected"),
            );
        }

        const id = crypto.randomUUID();

        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, {
                resolve: (value) => resolve(value as T),
                reject,
            });

            this.socket!.send(
                JSON.stringify({
                    id,
                    message,
                }),
            );
        });
    }

    async step(): Promise<void> {
        this.send("step");
    }

    async reset(): Promise<void> {
        this.send("reset");
    }

    async loadProject(projectId: string): Promise<Project> {
        const response = await this.send<Response<Project>>(
            `load $${projectId}`,
        );

        if (!response.result) {
            throw new Error("No result");
        }

        return response.result;
    }

    async loadFile(file: string): Promise<void> {
        await this.send<void>(
            `load $${file}`,
        );
    }

    async setFile(file: string, content: string): Promise<unknown> {
        return this.request("/simulator/project/file", {
            method: "PUT",
            body: JSON.stringify({
                filePath: file,
                content,
            }),
        });
    }

}