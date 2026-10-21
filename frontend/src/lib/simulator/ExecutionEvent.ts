export type ExecutionEvent =
    | InstructionFetchedEvent
    | InstructionDecodedEvent
    | InstructionExecutedEvent
    | RegisterWriteEvent
    | RegisterReadEvent
    | MemoryReadEvent
    | MemoryWriteEvent
    | MemoryClearedEvent
    | ProgramClearedEvent
    | ProgramAssembledEvent;

export type InstructionFormat =
    | "format1"
    | "format2"
    | "format3"
    | "format4";

export type OperandType =
    | "none"
    | "address"
    | "value"
    | "register"
    | "register_register"
    | "register_immediate";

export type InstructionFlag =
    | "none"
    | "privileged"
    | "extended"
    | "floating"
    | "sets_cc";

export interface InstructionDescription {
    id: number;
    mnemonic: string;
    opcode: number;
    formats: number;
    operand_type: number;
    flags: number;
}

export type DecodedOperand =
    | { kind: "value"; value: number }
    | { kind: "float"; bits: number }
    | { kind: "address"; address: number }
    | { kind: "registers"; r1: number; r2: number }
    | { kind: "register_value"; register: number; value: number }
    | { kind: "register"; register: number }
    | { kind: "none" };

export interface InstructionDecodedDetails {
    address: number;
    instruction_bytes: number[];
    instruction_value: number;
    fetched_bytes: number[];
    fetched_value: number;
    format: number;
    length: number;
    displacement: number;
    target_address: number;
    flags: { n: boolean; i: boolean; x: boolean; b: boolean; p: boolean; e: boolean };
    instruction: {
        id: number;
        mnemonic: string;
        opcode: number;
        formats: number;
        operand_type: number;
        instruction_flags: number;
    };
    operand: DecodedOperand;
}

export interface InstructionDecodedEvent {
    type: "InstructionDecoded";
    details: InstructionDecodedDetails;
}

export interface InstructionFetchedEvent {
    type: "InstructionFetched";
    address: number;
    bytes: number[];
    value: number;
}

export interface InstructionExecutedEvent {
    type: "InstructionExecuted";
    instruction: InstructionDescription | null;
}

export interface RegisterWriteEvent {
    type: "RegisterWrite";
    name: string;
    bytes: number[];
    value: number;
    old_bytes: number[];
    old_value: number;
}

export interface RegisterReadEvent {
    type: "RegisterRead";
    name: string;
    bytes: number[];
    value: number;
}

export interface MemoryWriteEvent {
    type: "MemoryWrite";
    address: number;
    bytes: number[];
    value: number;
    old_bytes: number[];
    old_value: number;
}

export interface MemoryReadEvent {
    type: "MemoryRead";
    address: number;
    bytes: number[];
    value: number;
}

// A label and its assembled address (or EQU value).
export interface AssemblySymbol {
    name: string;
    value: number;
}

// A warning or error of the assembler, at a 1-based line and column (0 when
// the column is unknown).
export interface AssemblyDiagnostic {
    severity: "error" | "warning";
    line: number;
    column: number;
    message: string;
}

export interface AssembledProgram {
    name: string;
    start: number;
    length: number;
    entry: number;
}

// One statement as Beck's Fig. 2.6 lists it: its pass-1 location (null for
// statements that take none, such as END and BASE) and its pass-2 object code.
export interface AssemblyListingLine {
    line: number;
    address: number | null;
    bytes: number[];
    source: string;
}

// A modification record: `halfBytes` hex digits from the high nibble of
// `address` hold an address the loader must relocate.
export interface AssemblyRelocation {
    address: number;
    halfBytes: number;
}

// What the assembler reports about a program. Only the symbol table is always
// there: a backend that predates the full report sends nothing else.
export interface AssemblyReport {
    symbols: AssemblySymbol[];
    program?: AssembledProgram;
    listing?: AssemblyListingLine[];
    relocations?: AssemblyRelocation[];
    diagnostics?: AssemblyDiagnostic[];
}

// Emitted by SICXE::load_file when it assembles a source file (not for hex
// dumps), as {"type":"ProgramAssembled","details":{"symbols":[{"name","value"}],
// "program":{"name","start","length","entry"},"listing":[{"line","address","bytes","source"}],
// "relocations":[{"address","halfBytes"}],"diagnostics":[warnings]}}.
// Extra detail fields are ignored.
export interface ProgramAssembledEvent {
    type: "ProgramAssembled";
    details: AssemblyReport;
}

export interface MemoryClearedEvent {
    type: "MemoryCleared";
}

export interface ProgramClearedEvent {
    type: "ProgramCleared";
}

function byteArray(value: unknown, field: string): number[] {
    if (!Array.isArray(value) || value.some((byte) =>
        typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255
    )) {
        throw new TypeError(`Invalid byte array in execution event field '${field}'`);
    }

    return value;
}

function symbolArray(value: unknown): AssemblySymbol[] {
    if (!Array.isArray(value) || value.some((symbol) =>
        symbol === null ||
        typeof symbol !== "object" ||
        typeof symbol.name !== "string" ||
        typeof symbol.value !== "number" ||
        !Number.isInteger(symbol.value)
    )) {
        throw new TypeError("Invalid symbol table in ProgramAssembled event");
    }

    return value.map((symbol) => ({ name: symbol.name, value: symbol.value }));
}

const isInteger = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value);

const isAddress = (value: unknown): value is number => isInteger(value) && value >= 0;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
}

function invalidReport(field: string): never {
    throw new TypeError(`Invalid ${field} in ProgramAssembled event`);
}

function programOf(value: unknown): AssembledProgram {
    if (!isRecord(value) || typeof value.name !== "string" ||
        !isAddress(value.start) || !isAddress(value.length) || !isAddress(value.entry)) {
        invalidReport("program");
    }
    return { name: value.name, start: value.start, length: value.length, entry: value.entry };
}

function listingOf(value: unknown): AssemblyListingLine[] {
    if (!Array.isArray(value)) invalidReport("listing");
    return value.map((line: unknown) => {
        if (!isRecord(line) || !isInteger(line.line) || typeof line.source !== "string" ||
            !(line.address === null || isAddress(line.address))) {
            invalidReport("listing");
        }
        return {
            line: line.line,
            address: line.address,
            bytes: byteArray(line.bytes, "listing.bytes"),
            source: line.source,
        };
    });
}

function relocationsOf(value: unknown): AssemblyRelocation[] {
    if (!Array.isArray(value)) invalidReport("relocations");
    return value.map((relocation: unknown) => {
        if (!isRecord(relocation) || !isAddress(relocation.address) || !isAddress(relocation.halfBytes)) {
            invalidReport("relocations");
        }
        return { address: relocation.address, halfBytes: relocation.halfBytes };
    });
}

function diagnosticsOf(value: unknown): AssemblyDiagnostic[] {
    if (!Array.isArray(value)) invalidReport("diagnostics");
    return value.map((diagnostic: unknown) => {
        if (!isRecord(diagnostic) ||
            (diagnostic.severity !== "error" && diagnostic.severity !== "warning") ||
            !isInteger(diagnostic.line) || !isInteger(diagnostic.column) ||
            typeof diagnostic.message !== "string") {
            invalidReport("diagnostics");
        }
        return {
            severity: diagnostic.severity,
            line: diagnostic.line,
            column: diagnostic.column,
            message: diagnostic.message,
        };
    });
}

// Each optional part is validated when present and left out when absent.
function assemblyReport(details: Record<string, unknown>): AssemblyReport {
    return {
        symbols: symbolArray(details.symbols),
        ...(details.program !== undefined && { program: programOf(details.program) }),
        ...(details.listing !== undefined && { listing: listingOf(details.listing) }),
        ...(details.relocations !== undefined && { relocations: relocationsOf(details.relocations) }),
        ...(details.diagnostics !== undefined && { diagnostics: diagnosticsOf(details.diagnostics) }),
    };
}

export function bytesToNumber(bytes: number[]): number {
    return bytes.reduce((value, byte) => value * 256 + byte, 0);
}

export function normalizeExecutionEvent(raw: unknown): ExecutionEvent {
    if (raw === null || typeof raw !== "object") {
        throw new TypeError("Invalid execution event");
    }

    const event = raw as Record<string, unknown>;

    switch (event.type) {
        case "InstructionFetched": {
            const bytes = byteArray(event.value, "value");
            return {
                type: "InstructionFetched",
                address: event.address as number,
                bytes,
                value: bytesToNumber(bytes),
            };
        }
        case "RegisterWrite": {
            const bytes = byteArray(event.value, "value");
            const old_bytes = byteArray(event.old_value, "old_value");
            return {
                type: "RegisterWrite",
                name: event.name as string,
                bytes,
                value: bytesToNumber(bytes),
                old_bytes,
                old_value: bytesToNumber(old_bytes),
            };
        }
        case "RegisterRead": {
            const bytes = byteArray(event.value, "value");
            return {
                type: "RegisterRead",
                name: event.name as string,
                bytes,
                value: bytesToNumber(bytes),
            };
        }
        case "MemoryWrite": {
            const bytes = byteArray(event.value, "value");
            const old_bytes = byteArray(event.old_value, "old_value");
            return {
                type: "MemoryWrite",
                address: event.address as number,
                bytes,
                value: bytesToNumber(bytes),
                old_bytes,
                old_value: bytesToNumber(old_bytes),
            };
        }
        case "MemoryRead": {
            const bytes = byteArray(event.value, "value");
            return {
                type: "MemoryRead",
                address: event.address as number,
                bytes,
                value: bytesToNumber(bytes),
            };
        }
        case "InstructionDecoded": {
            const details = event.details as Record<string, unknown>;
            const instruction_bytes = byteArray(details.instruction_bytes, "instruction_bytes");
            const fetched_bytes = byteArray(details.fetched_bytes, "fetched_bytes");
            return {
                type: "InstructionDecoded",
                details: {
                    ...details,
                    instruction_bytes,
                    instruction_value: bytesToNumber(instruction_bytes),
                    fetched_bytes,
                    fetched_value: bytesToNumber(fetched_bytes),
                } as InstructionDecodedDetails,
            };
        }
        case "InstructionExecuted":
            return event as unknown as InstructionExecutedEvent;
        case "ProgramAssembled": {
            const details = (event.details ?? {}) as Record<string, unknown>;
            return { type: "ProgramAssembled", details: assemblyReport(details) };
        }
        case "MemoryCleared":
            return { type: "MemoryCleared" };
        case "ProgramCleared":
            return { type: "ProgramCleared" };
        default:
            throw new TypeError(`Unknown execution event type '${String(event.type)}'`);
    }
}

export function normalizeExecutionEvents(raw: unknown): ExecutionEvent[] {
    if (!Array.isArray(raw)) {
        throw new TypeError("Expected the simulator response to be an event array");
    }
    return raw.map(normalizeExecutionEvent);
}

// The report of the last assembly in a batch of events, or null when the batch
// assembled nothing (for example, a hex dump was loaded) or discarded the
// assembly after it (ProgramCleared, as `clear` and every load send it).
export function assemblyFromEvents(events: ExecutionEvent[]): AssemblyReport | null {
    const assembled = events.findLast((event) =>
        event.type === "ProgramAssembled" || event.type === "ProgramCleared",
    );
    return assembled?.type === "ProgramAssembled" ? assembled.details : null;
}

// The symbol table of the last assembly in a batch of events, or null when the
// batch assembled nothing.
export function symbolsFromEvents(events: ExecutionEvent[]): AssemblySymbol[] | null {
    return assemblyFromEvents(events)?.symbols ?? null;
}
