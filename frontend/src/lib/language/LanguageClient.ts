export type LanguageRange = {
    start: { line: number; character: number };
    end: { line: number; character: number };
};

export type LanguageDiagnostic = {
    range: LanguageRange;
    severity?: number;
    source?: string;
    message: string;
};

export type LanguageCatalog = {
    instructions: string[];
    directives: string[];
    registers: string[];
};

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
};

type OpenDocument = {
    text: string;
    version: number;
    sentVersion: number;
    opened: boolean;
    timer: ReturnType<typeof setTimeout> | null;
};

type JsonRpcMessage = {
    jsonrpc?: string;
    id?: number | string | null;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: { code?: number; message?: string };
};

const CHANGE_DELAY_MS = 250;

/** JSON-RPC client for the assembler language WebSocket. */
export class AssemblerLanguageClient {
    private socket: WebSocket | null = null;
    private connection: Promise<void> | null = null;
    private startPromise: Promise<void> | null = null;
    private initializedForSocket = false;
    private hasStartedBefore = false;
    private disposed = false;
    private nextRequestId = 1;
    private pending = new Map<number, PendingRequest>();
    private documents = new Map<string, OpenDocument>();
    private diagnosticListeners = new Map<string, Set<(items: LanguageDiagnostic[]) => void>>();
    private catalog: LanguageCatalog | null = null;
    private catalogListeners = new Set<(catalog: LanguageCatalog) => void>();

    constructor(private readonly url: string) {}

    async start(): Promise<void> {
        if (this.disposed) throw new Error("Language client is disposed");
        if (this.initializedForSocket) return;
        if (!this.startPromise) {
            this.startPromise = (async () => {
                await this.connect();
                const resumed = this.hasStartedBefore;
                const initialized = await this.sendRequest<{
                    capabilities?: { experimental?: { sicxe?: LanguageCatalog } };
                }>("initialize", {
                    processId: null,
                    clientInfo: { name: "SIC/XE Studio", version: "1.0" },
                    rootUri: null,
                    capabilities: {},
                });
                this.catalog = initialized.capabilities?.experimental?.sicxe ?? null;
                this.sendNotification("initialized", {});
                this.initializedForSocket = true;
                this.hasStartedBefore = true;
                if (this.catalog) {
                    for (const listener of this.catalogListeners) listener(this.catalog);
                }
                if (resumed) await this.reopenDocuments();
            })().finally(() => {
                this.startPromise = null;
            });
        }
        return this.startPromise;
    }

    async openDocument(uri: string, text: string): Promise<void> {
        let document = this.documents.get(uri);
        if (document) {
            this.changeDocument(uri, text);
        } else {
            document = {
                text,
                version: 1,
                sentVersion: 0,
                opened: false,
                timer: null,
            };
            this.documents.set(uri, document);
        }
        await this.ensureDocumentOpen(uri, document);
    }

    changeDocument(uri: string, text: string): void {
        const document = this.documents.get(uri);
        if (!document || document.text === text) return;
        document.text = text;
        document.version += 1;
        if (!document.opened) return;
        if (document.timer) clearTimeout(document.timer);
        document.timer = setTimeout(() => {
            document.timer = null;
            void this.flushChange(uri, document).catch((error: unknown) => {
                console.warn("Assembler language service change failed:", error);
            });
        }, CHANGE_DELAY_MS);
    }

    async saveDocument(uri: string, text: string): Promise<void> {
        this.changeDocument(uri, text);
        await this.start();
        const document = this.documents.get(uri);
        if (!document) return;
        if (!document.opened) this.sendOpen(uri, document);
        else await this.flushChange(uri, document);
        this.sendNotification("textDocument/didSave", {
            textDocument: { uri },
        });
    }

    async closeDocument(uri: string): Promise<void> {
        const document = this.documents.get(uri);
        if (!document) return;
        if (document.timer) clearTimeout(document.timer);
        this.documents.delete(uri);
        if (document.opened && this.socket?.readyState === WebSocket.OPEN) {
            this.sendNotification("textDocument/didClose", { textDocument: { uri } });
        }
    }

    onDiagnostics(uri: string, listener: (items: LanguageDiagnostic[]) => void): () => void {
        const listeners = this.diagnosticListeners.get(uri) ?? new Set();
        listeners.add(listener);
        this.diagnosticListeners.set(uri, listeners);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) this.diagnosticListeners.delete(uri);
        };
    }

    onCatalog(listener: (catalog: LanguageCatalog) => void): () => void {
        this.catalogListeners.add(listener);
        if (this.catalog) listener(this.catalog);
        return () => this.catalogListeners.delete(listener);
    }

    async request<T>(method: string, params: unknown): Promise<T> {
        await this.start();
        const uri = (params as { textDocument?: { uri?: unknown } } | null)?.textDocument?.uri;
        if (typeof uri === "string") {
            const document = this.documents.get(uri);
            if (document) await this.ensureDocumentOpen(uri, document);
        }
        return this.sendRequest<T>(method, params);
    }

    dispose(): void {
        this.disposed = true;
        for (const [uri, document] of this.documents) {
            if (document.timer) clearTimeout(document.timer);
            if (document.opened && this.socket?.readyState === WebSocket.OPEN) {
                this.sendNotification("textDocument/didClose", {
                    textDocument: { uri },
                });
            }
        }
        this.documents.clear();
        this.diagnosticListeners.clear();
        this.catalogListeners.clear();
        this.socket?.close();
        this.socket = null;
        this.connection = null;
        this.initializedForSocket = false;
        this.rejectPending(new Error("Language client disposed"));
    }

    private connect(): Promise<void> {
        if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
        if (this.connection) return this.connection;
        if (this.disposed) return Promise.reject(new Error("Language client is disposed"));

        this.connection = new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(this.url);
            this.socket = socket;
            socket.onopen = () => {
                if (this.socket !== socket) return;
                this.connection = null;
                resolve();
            };
            socket.onmessage = (event) => this.handleMessage(event.data);
            socket.onerror = () => {
                if (this.socket === socket) this.socket = null;
                this.connection = null;
                reject(new Error("Could not connect to the assembler language service"));
            };
            socket.onclose = () => {
                if (this.socket !== socket) return;
                this.socket = null;
                this.connection = null;
                this.initializedForSocket = false;
                for (const document of this.documents.values()) {
                    document.opened = false;
                    document.sentVersion = 0;
                }
                this.rejectPending(new Error("Assembler language service connection closed"));
            };
        });
        return this.connection;
    }

    private async reopenDocuments(): Promise<void> {
        for (const [uri, document] of this.documents) {
            if (!document.opened) this.sendOpen(uri, document);
        }
    }

    private async ensureDocumentOpen(uri: string, document: OpenDocument): Promise<void> {
        await this.start();
        if (this.documents.get(uri) !== document || document.opened) return;
        this.sendOpen(uri, document);
    }

    private sendOpen(uri: string, document: OpenDocument): void {
        this.sendNotification("textDocument/didOpen", {
            textDocument: {
                uri,
                languageId: "sicxe",
                version: document.version,
                text: document.text,
            },
        });
        document.opened = true;
        document.sentVersion = document.version;
    }

    private async flushChange(uri: string, document: OpenDocument): Promise<void> {
        if (document.timer) {
            clearTimeout(document.timer);
            document.timer = null;
        }
        if (!document.opened || document.sentVersion >= document.version) return;
        await this.connect();
        this.sendNotification("textDocument/didChange", {
            textDocument: { uri, version: document.version },
            contentChanges: [{ text: document.text }],
        });
        document.sentVersion = document.version;
    }

    private async sendRequest<T = unknown>(method: string, params: unknown): Promise<T> {
        await this.connect();
        const socket = this.socket;
        if (!socket || socket.readyState !== WebSocket.OPEN)
            throw new Error("Assembler language service is disconnected");
        const id = this.nextRequestId++;
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, {
                resolve: (value) => resolve(value as T),
                reject,
            });
            try {
                socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
            } catch (error) {
                this.pending.delete(id);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    private sendNotification(method: string, params: unknown): void {
        const socket = this.socket;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
    }

    private handleMessage(data: unknown): void {
        if (typeof data !== "string") return;
        let message: JsonRpcMessage;
        try {
            message = JSON.parse(data) as JsonRpcMessage;
        } catch {
            console.warn("Ignored malformed language service message");
            return;
        }

        if (message.method === "textDocument/publishDiagnostics") {
            const params = message.params as {
                uri?: string;
                version?: number;
                diagnostics?: LanguageDiagnostic[];
            } | undefined;
            if (!params?.uri || !Array.isArray(params.diagnostics)) return;
            const document = this.documents.get(params.uri);
            if (!document || (typeof params.version === "number" && params.version < document.version)) return;
            for (const listener of this.diagnosticListeners.get(params.uri) ?? [])
                listener(params.diagnostics);
            return;
        }

        if (message.id === undefined || message.id === null) return;
        const id = Number(message.id);
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        if (message.error) pending.reject(new Error(message.error.message ?? "Language service request failed"));
        else pending.resolve(message.result);
    }

    private rejectPending(error: Error): void {
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
    }
}
