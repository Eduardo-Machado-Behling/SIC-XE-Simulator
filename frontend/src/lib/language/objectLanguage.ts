import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";

// Highlighting for the readable object programs (.obj) and the linked program (.out):
// Beck's H/D/R/T/M/E records, plus the "  .  address  bytes  source" annotation lines.
// Tokens reuse the sicxe-dark theme's colours; there is no language service behind it.
export const OBJECT_LANGUAGE_ID = "sicxe-object";

const HEX = /[0-9A-Fa-f]+/;

const OBJECT_MONARCH: languages.IMonarchLanguage = {
    defaultToken: "",
    includeLF: true, // each record's state ends with its line
    tokenizer: {
        root: [
            [/^(\s+\.)(\s+)([0-9A-Fa-f]+)(\s+)([0-9A-Fa-f]+)(.*)/,
                ["sicxe-comment", "", "sicxe-number", "", "sicxe-hex", "sicxe-comment"]],
            [/^H(?=\s|$)/, { token: "sicxe-directive", next: "@header" }],
            [/^D(?=\s|$)/, { token: "sicxe-directive", next: "@define" }],
            [/^R(?=\s|$)/, { token: "sicxe-directive", next: "@refer" }],
            [/^T(?=\s|$)/, { token: "sicxe-directive", next: "@textAddress" }],
            [/^M(?=\s|$)/, { token: "sicxe-directive", next: "@modification" }],
            [/^E(?=\s|$)/, { token: "sicxe-directive", next: "@numbers" }],
        ],
        lineEnd: [
            [/\n/, "", "@pop"],
            [/[ \t]+/, ""],
            [/\.(?=[ \t\n]|$).*/, "sicxe-comment"],
        ],
        // H name start length
        header: [{ include: "@lineEnd" }, [/\S+/, { token: "sicxe-label", switchTo: "@numbers" }]],
        numbers: [{ include: "@lineEnd" }, [HEX, "sicxe-number"]],
        // D name address name address ...
        define: [{ include: "@lineEnd" }, [/(\S+)([ \t]+)([0-9A-Fa-f]+)/, ["sicxe-label", "", "sicxe-number"]]],
        // R name name ...
        refer: [{ include: "@lineEnd" }, [/\S+/, "sicxe-symbol"]],
        // T address length bytes...
        textAddress: [{ include: "@lineEnd" }, [HEX, { token: "sicxe-number", switchTo: "@textLength" }]],
        textLength: [{ include: "@lineEnd" }, [HEX, { token: "sicxe-number", switchTo: "@textBytes" }]],
        textBytes: [{ include: "@lineEnd" }, [HEX, "sicxe-hex"]],
        // M address half-bytes ±symbol
        modification: [
            { include: "@lineEnd" },
            [/([+-])(\S+)/, ["sicxe-operator", "sicxe-symbol"]],
            [HEX, "sicxe-number"],
        ],
    },
};

export function registerObjectLanguage(monaco: Monaco): void {
    if (monaco.languages.getLanguages().some((language: { id: string }) => language.id === OBJECT_LANGUAGE_ID)) return;
    monaco.languages.register({ id: OBJECT_LANGUAGE_ID, aliases: ["SIC/XE object program"] });
    monaco.languages.setMonarchTokensProvider(OBJECT_LANGUAGE_ID, OBJECT_MONARCH);
}
