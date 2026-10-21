import { describe, expect, it } from "vitest";

import type { AssemblyListingLine } from "@/lib/simulator/ExecutionEvent";
import { objectProgram, recordFields, recordText, type ObjectProgramInput } from "@/lib/simulator/ObjectProgram";

// Beck, Fig. 2.6: [Loc (null = none), object code] of every statement of COPY.
const FIG_2_6: [number | null, string][] = [
    [0x0000, ""], [0x0000, "17202D"], [0x0003, "69202D"], [null, ""], [0x0006, "4B101036"],
    [0x000A, "032026"], [0x000D, "290000"], [0x0010, "332007"], [0x0013, "4B10105D"],
    [0x0017, "3F2FEC"], [0x001A, "032010"], [0x001D, "0F2016"], [0x0020, "010003"],
    [0x0023, "0F200D"], [0x0026, "4B10105D"], [0x002A, "3E2003"], [0x002D, "454F46"],
    [0x0030, ""], [0x0033, ""], [0x0036, ""],
    [0x1036, "B410"], [0x1038, "B400"], [0x103A, "B440"], [0x103C, "75101000"],
    [0x1040, "E32019"], [0x1043, "332FFA"], [0x1046, "DB2013"], [0x1049, "A004"],
    [0x104B, "332008"], [0x104E, "57C003"], [0x1051, "B850"], [0x1053, "3B2FEA"],
    [0x1056, "134000"], [0x1059, "4F0000"], [0x105C, "F1"],
    [0x105D, "B410"], [0x105F, "774000"], [0x1062, "E32011"], [0x1065, "332FFA"],
    [0x1068, "53C003"], [0x106B, "DF2008"], [0x106E, "B850"], [0x1070, "3B2FEF"],
    [0x1073, "4F0000"], [0x1076, "05"], [null, ""],
];

function bytes(object: string): number[] {
    return (object.match(/../g) ?? []).map((pair) => parseInt(pair, 16));
}

function listing(rows: [number | null, string][]): AssemblyListingLine[] {
    return rows.map(([address, object], index) => ({ line: index + 1, address, bytes: bytes(object), source: "" }));
}

const COPY: ObjectProgramInput = {
    program: { name: "COPY", start: 0, length: 0x1077, entry: 0 },
    listing: listing(FIG_2_6),
    relocations: [
        { address: 0x07, halfBytes: 5 },
        { address: 0x14, halfBytes: 5 },
        { address: 0x27, halfBytes: 5 },
    ],
};

describe("objectProgram", () => {
    it("builds Beck's Fig. 2.8 from the listing of Fig. 2.6", () => {
        expect(objectProgram(COPY).map(recordText)).toEqual([
            "HCOPY  000000001077",
            "T0000001D17202D69202D4B1010360320262900003320074B10105D3F2FEC032010",
            "T00001D130F20160100030F200D4B10105D3E2003454F46",
            "T0010361DB410B400B44075101000E32019332FFADB2013A00433200857C003B850",
            "T0010531D3B2FEA1340004F0000F1B410774000E32011332FFA53C003DF2008B850",
            "T001070073B2FEF4F000005",
            "M00000705",
            "M00001405",
            "M00002705",
            "E000000",
        ]);
    });

    it("splits each record into the fields Beck separates with ^", () => {
        const [header, text, , , , , modification, , , end] = objectProgram(COPY);

        expect(recordFields(header)).toEqual(["H", "COPY  ", "000000", "001077"]);
        expect(recordFields(text)).toEqual([
            "T", "000000", "1D",
            "17202D", "69202D", "4B101036", "032026", "290000", "332007", "4B10105D", "3F2FEC", "032010",
        ]);
        expect(recordFields(modification)).toEqual(["M", "000007", "05"]);
        expect(recordFields(end)).toEqual(["E", "000000"]);
    });

    it("gives M records relative to the start of the program (Beck, p. 64)", () => {
        // PROG  START 0x1000 / FIRST +JSUB SBR / LDA #1 / SBR RSUB / END FIRST:
        // +JSUB at 1000 is 4B101007, its address field starts at 1001, which is
        // 000001 from the start of the program; H, T and E stay absolute.
        const records = objectProgram({
            program: { name: "PROG", start: 0x1000, length: 0x0A, entry: 0x1000 },
            listing: listing([[0x1000, ""], [0x1000, "4B101007"], [0x1004, "010001"], [0x1007, "4F0000"], [null, ""]]),
            relocations: [{ address: 0x1001, halfBytes: 5 }],
        });

        expect(records.map(recordText)).toEqual([
            "HPROG  00100000000A",
            "T0010000A4B1010070100014F0000",
            "M00000105",
            "E001000",
        ]);
    });

    it("splits data longer than a text record across records", () => {
        // 40 bytes of BYTE data at 0x100: 30 in the first record, 10 in the next.
        const data = Array.from({ length: 40 }, (_, index) => index);
        const records = objectProgram({
            program: { name: "DATA", start: 0x100, length: 40, entry: 0x100 },
            listing: [{ line: 1, address: 0x100, bytes: data, source: "" }],
            relocations: [],
        });

        expect(records.map(recordText)).toEqual([
            "HDATA  000100000028",
            "T0001001E" + "000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D",
            "T00011E0A" + "1E1F2021222324252627",
            "E000100",
        ]);
    });

    it("starts a new text record where the location counter jumps back, as after ORG", () => {
        const records = objectProgram({
            program: { name: "P", start: 0, length: 6, entry: 0 },
            listing: listing([[0x0003, "4F0000"], [0x0000, "4F0000"]]),
            relocations: [],
        });

        expect(records.map(recordText)).toEqual([
            "HP     000000000006",
            "T000003034F0000",
            "T000000034F0000",
            "E000000",
        ]);
    });

    it("keeps the header name to the six columns of the record", () => {
        const records = objectProgram({
            program: { name: "LONGNAME", start: 0, length: 0, entry: 0 },
            listing: [],
            relocations: [],
        });

        expect(records.map(recordText)).toEqual(["HLONGNA000000000000", "E000000"]);
    });
});
