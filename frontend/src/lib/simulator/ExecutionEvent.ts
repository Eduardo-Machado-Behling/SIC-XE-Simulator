export type ExecutionEvent =
    | InstructionFetchedEvent
    | InstructionDecodedEvent
    | InstructionExecutedEvent
    | RegisterWriteEvent
    | RegisterReadEvent
    | MemoryReadEvent
    | MemoryWriteEvent;

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

function byteArray(value: unknown, field: string): number[] {
    if (!Array.isArray(value) || value.some((byte) =>
        typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255
    )) {
        throw new TypeError(`Invalid byte array in execution event field '${field}'`);
    }

    return value;
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
