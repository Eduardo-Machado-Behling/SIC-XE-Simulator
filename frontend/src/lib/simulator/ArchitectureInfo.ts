export type Endianness = "big" | "little";

export type RegisterType =
    | "general_purpose"
    | "special_purpose";

export interface MemoryDescription {
    address_space_size: number;
    address_width: number;
    word_size: number;
    alignment: number;
    endianness: Endianness;
}

export interface RegisterDescription {
    id: number;
    name: string;
    description: string;
    width: number;
    type: RegisterType;
}

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

export interface ArchitectureInfo {
    name: string;
    description: string;

    memory: MemoryDescription;

    registers: RegisterDescription[];
    instructions: InstructionDescription[];
}