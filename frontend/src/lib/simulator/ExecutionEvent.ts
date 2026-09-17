export type ExecutionEvent =
    | InstructionFetchedEvent
    | InstructionExecutedEvent
    | RegisterWriteEvent
    | RegisterReadEvent
    | MemoryWriteEvent;

export type InstructionFormat =
    | "format1"
    | "format2"
    | "format3"
    | "format4";

export type OperandType =
    | "none"
    | "memory"
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
    formats: InstructionFormat[];
    operand_type: OperandType;
    flags: InstructionFlag[];
}

export interface InstructionFetchedEvent {
    type: "InstructionFetched";
    address: number;
    value: number[];
}

export interface InstructionExecutedEvent {
    type: "InstructionExecuted";
    instruction: InstructionDescription;
}

export interface RegisterWriteEvent {
    type: "RegisterWrite";
    name: string;
    value: number;
}

export interface RegisterReadEvent {
    type: "RegisterRead";
    name: string;
    value: number;
}

export interface MemoryWriteEvent {
    type: "MemoryWrite";
    address: number;
    value: number[];
}