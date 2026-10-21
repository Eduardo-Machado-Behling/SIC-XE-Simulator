import type {
    AssembledProgram,
    AssemblyListingLine,
    AssemblyRelocation,
} from "@/lib/simulator/ExecutionEvent";
import { hex, hexBytes } from "@/lib/simulator/hex";

// The records of a SIC/XE object program (Beck, section 2.1.1 and Fig. 2.8).
// Every address is absolute except an M record's, which is relative to the
// start of the program (Beck, p. 64).
export type ObjectRecord =
    | { type: "H"; name: string; start: number; length: number }
    | { type: "T"; start: number; code: number[][] }
    | { type: "M"; address: number; halfBytes: number }
    | { type: "E"; entry: number };

export type ObjectProgramInput = {
    program: AssembledProgram;
    listing: AssemblyListingLine[];
    relocations: AssemblyRelocation[];
};

const TEXT_RECORD_BYTES = 30; // columns 10-69 of a Text record: 0x1E bytes

// Builds the object program of an assembled program from its listing. A Text
// record holds at most 30 bytes of consecutive addresses, so a new one starts
// where the location counter jumps (RESW, RESB, ORG) or where the next
// statement's code would not fit; a statement's code is only split when it is
// longer than a whole record, which only data can be.
export function objectProgram({ program, listing, relocations }: ObjectProgramInput): ObjectRecord[] {
    const texts: Extract<ObjectRecord, { type: "T" }>[] = [];
    let current: (typeof texts)[number] | null = null;
    let currentEnd = 0;

    for (const line of listing) {
        if (line.address === null || line.bytes.length === 0) continue;

        const used = current ? currentEnd - current.start : 0;
        if (current && (currentEnd !== line.address || used + line.bytes.length > TEXT_RECORD_BYTES)) {
            current = null;
        }

        let address = line.address;
        let rest = line.bytes;
        while (rest.length > 0) {
            if (!current) {
                current = { type: "T", start: address, code: [] };
                currentEnd = address;
                texts.push(current);
            }
            const room = TEXT_RECORD_BYTES - (currentEnd - current.start);
            const chunk = rest.slice(0, room);
            current.code.push(chunk);
            currentEnd += chunk.length;
            address += chunk.length;
            rest = rest.slice(chunk.length);
            if (rest.length > 0) current = null;
        }
    }

    return [
        { type: "H", name: program.name, start: program.start, length: program.length },
        ...texts,
        ...relocations.map((relocation) => modificationRecord(relocation, program.start)),
        { type: "E", entry: program.entry },
    ];
}

// The M record of a relocation: the assembler reports the field's absolute
// address, the record holds it relative to the start of the program.
export function modificationRecord(relocation: AssemblyRelocation, start: number): ObjectRecord {
    return { type: "M", address: relocation.address - start, halfBytes: relocation.halfBytes };
}

// The fields of a record, which Beck's figures separate with ^; a Text
// record's code is one field per statement.
export function recordFields(record: ObjectRecord): string[] {
    switch (record.type) {
        case "H":
            // The name has six columns: shorter names are padded, longer ones cut.
            return ["H", record.name.padEnd(6).slice(0, 6), hex(record.start, 6), hex(record.length, 6)];
        case "T": {
            const length = record.code.reduce((total, code) => total + code.length, 0);
            return ["T", hex(record.start, 6), hex(length, 2), ...record.code.map(hexBytes)];
        }
        case "M":
            return ["M", hex(record.address, 6), hex(record.halfBytes, 2)];
        case "E":
            return ["E", hex(record.entry, 6)];
    }
}

export function recordText(record: ObjectRecord): string {
    return recordFields(record).join("");
}
