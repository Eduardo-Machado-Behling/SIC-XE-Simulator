import { describe, expect, it } from "vitest";

import {
    canLink,
    dropFromLinkSet,
    filesToLink,
    isEntryFile,
    parseLoadAddress,
    renameInLinkSet,
} from "@/lib/simulator/generatedFiles";

const MAIN = "PROG    ENTRY 0\n        EXTREF SUBB\n       +JSUB SUBB\n        END\n";
const SUB = "SUBB    START 0\n        RSUB\n        END\n";
const files = { "main.asm": MAIN, "sub.asm": SUB, "zeta.asm": SUB.replace("SUBB", "ZETA"), "MASMAPRG.ASM": SUB, "dump.asm": ";hex\n4F0000\n" };

describe("filesToLink", () => {
    it("runs the open file when no file is switched on, as Run always did", () => {
        expect(filesToLink(files, [], "sub.asm", null, "SIC/XE")).toEqual(["sub.asm"]);
    });

    it("links exactly the switched-on files, never adding the open one", () => {
        expect(filesToLink(files, ["sub.asm"], "main.asm", null, "SIC/XE")).toEqual(["sub.asm"]);
    });

    it("puts the ENTRY file first, then path order", () => {
        expect(filesToLink(files, ["zeta.asm", "sub.asm", "main.asm"], "zeta.asm", null, "SIC/XE"))
            .toEqual(["main.asm", "sub.asm", "zeta.asm"]);
    });

    it("drops paths that no longer exist or cannot be linked", () => {
        expect(filesToLink(files, ["gone.asm", "sub.asm", "MASMAPRG.ASM"], "main.asm", null, "SIC/XE")).toEqual(["sub.asm"]);
        expect(filesToLink(files, ["gone.asm"], "main.asm", null, "SIC/XE")).toEqual(["main.asm"]);
    });
});

describe("canLink and isEntryFile", () => {
    it("only lets assembly sources take part", () => {
        expect(canLink("main.asm", files)).toBe(true);
        expect(canLink("MASMAPRG.ASM", files)).toBe(false);
        expect(canLink("dump.asm", files)).toBe(false);
        expect(canLink("notes.txt", { "notes.txt": "hello" })).toBe(false);
    });

    it("finds ENTRY as a directive, not as a label", () => {
        expect(isEntryFile(MAIN)).toBe(true);
        expect(isEntryFile("prog entry 0\n end\n")).toBe(true);
        expect(isEntryFile("ENTRY   lda #5\n")).toBe(false);
        expect(isEntryFile(". PROG ENTRY 0 in a comment\nP START 0\n")).toBe(false);
        expect(isEntryFile("P START 0 ; ENTRY later\n")).toBe(false);
    });
});

describe("the link set follows the explorer", () => {
    it("renames a file and the files of a renamed folder", () => {
        expect(renameInLinkSet(["main.asm", "lib/a.asm"], "main.asm", "prog.asm")).toEqual(["prog.asm", "lib/a.asm"]);
        expect(renameInLinkSet(["main.asm", "lib/a.asm"], "lib", "src")).toEqual(["main.asm", "src/a.asm"]);
        expect(renameInLinkSet(["library.asm"], "lib", "src")).toEqual(["library.asm"]);
    });

    it("drops a deleted file and the files of a deleted folder", () => {
        expect(dropFromLinkSet(["main.asm", "lib/a.asm", "library.asm"], "lib")).toEqual(["main.asm", "library.asm"]);
        expect(dropFromLinkSet(["main.asm", "sub.asm"], "sub.asm")).toEqual(["main.asm"]);
    });
});

describe("parseLoadAddress", () => {
    it("reads hexadecimal inside the memory", () => {
        expect(parseLoadAddress("1000", 0x100000)).toBe(0x1000);
        expect(parseLoadAddress(" ff ", 0x100000)).toBe(0xff);
        expect(parseLoadAddress("", 0x100000)).toBe(0);
    });

    it("rejects what is not an address of this memory", () => {
        expect(parseLoadAddress("G", 0x100000)).toBeNull();
        expect(parseLoadAddress("0x10", 0x100000)).toBeNull();
        expect(parseLoadAddress("100000", 0x100000)).toBeNull();
    });
});
