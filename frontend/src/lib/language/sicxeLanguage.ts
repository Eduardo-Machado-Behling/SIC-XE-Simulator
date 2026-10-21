import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";
import type { AssemblerLanguageClient, LanguageCatalog, LanguageRange } from "@/lib/language/LanguageClient";

type LspLocation = { uri: string; range: LanguageRange };
type LspCompletion = {
    label: string;
    kind?: number;
    detail?: string;
    insertText?: string;
    textEdit?: { range: LanguageRange; newText: string };
};
type MonarchLanguage = languages.IMonarchLanguage;
type CompletionProvider = languages.CompletionItemProvider;
type HoverProvider = languages.HoverProvider;
type DefinitionProvider = languages.DefinitionProvider;
type ReferenceProvider = languages.ReferenceProvider;
type RenameProvider = languages.RenameProvider;

let monacoApi: Monaco | null = null;
let currentClient: AssemblerLanguageClient | null = null;
let providersRegistered = false;
const fallbackVocabulary: LanguageCatalog = {
    instructions: [
        "ADD", "ADDF", "ADDR", "AND", "CLEAR", "COMP", "COMPF", "COMPR", "DIV", "DIVF", "DIVR",
        "FIX", "FLOAT", "HALT", "HIO", "J", "JEQ", "JGT", "JLT", "JSUB", "LDA", "LDB", "LDCH",
        "LDF", "LDL", "LDS", "LDT", "LDX", "LPS", "MUL", "MULF", "MULR", "NORM", "OR", "RD",
        "RMO", "RSUB", "SHIFTL", "SHIFTR", "SIO", "SSK", "STA", "STB", "STCH", "STF", "STI",
        "STL", "STS", "STSW", "STT", "STX", "SUB", "SUBF", "SUBR", "SVC", "TD", "TIO", "TIX",
        "TIXR", "WD",
    ],
    directives: ["START", "END", "BYTE", "WORD", "RESB", "RESW", "BASE", "NOBASE", "EQU", "ORG"],
    registers: ["A", "X", "L", "B", "S", "T", "F", "PC", "SW"],
};
let vocabulary: LanguageCatalog = fallbackVocabulary;

export function setAssemblerLanguageClient(client: AssemblerLanguageClient | null): void {
    currentClient = client;
    if (client) {
        client.onCatalog((catalog) => {
            vocabulary = catalog;
            if (monacoApi) installTokenizer(monacoApi, catalog);
        });
    }
}

function monarchDefinition(catalog: LanguageCatalog): MonarchLanguage {
    // Keep the tokens colored immediately, before the language-server handshake
    // has supplied its authoritative instruction and directive lists.
    const available = {
        instructions: catalog.instructions.length ? catalog.instructions : fallbackVocabulary.instructions,
        directives: catalog.directives.length ? catalog.directives : fallbackVocabulary.directives,
        registers: catalog.registers.length ? catalog.registers : fallbackVocabulary.registers,
    };
    return {
        ignoreCase: true,
        instructions: available.instructions,
        directives: available.directives,
        registers: available.registers,
        registersPrefixed: available.registers.map((register) => `$${register}`),
        tokenizer: {
            root: [
                [/^\..*$/, "sicxe-comment"],
                [/;.*$/, "sicxe-comment"],
                [/[ \t]+/, "white"],
                [/C'[^']*'/i, "sicxe-string"],
                [/X'[0-9a-fA-F]*'/i, "sicxe-hex"],
                [/\$[A-Za-z_][A-Za-z0-9_]*/, {
                    cases: {
                        "@registersPrefixed": "sicxe-register",
                        "@default": "sicxe-invalid-register",
                    },
                }],
                [/\+[A-Za-z_][A-Za-z0-9_]*/, "sicxe-extended-instruction"],
                [/^[A-Za-z_][A-Za-z0-9_]*(?=\s+)/, {
                    cases: {
                        "@instructions": "sicxe-instruction",
                        "@directives": "sicxe-directive",
                        "@default": "sicxe-label",
                    },
                }],
                [/[A-Za-z_][A-Za-z0-9_]*/, {
                    cases: {
                        "@instructions": "sicxe-instruction",
                        "@directives": "sicxe-directive",
                        "@registers": "sicxe-missing-register-prefix",
                        "@default": "sicxe-symbol",
                    },
                }],
                [/0[xX][0-9a-fA-F]+/, "sicxe-hex"],
                [/\d+/, "sicxe-number"],
                [/[#@]/, "sicxe-operator"],
                [/,[pPbB]\b/, "sicxe-relative-mode"],
                [/,/, "sicxe-delimiter"],
                [/[()+*/-]/, "sicxe-operator"],
            ],
        },
    };
}

function installTokenizer(monaco: Monaco, catalog: LanguageCatalog): void {
    monaco.languages.setMonarchTokensProvider("sicxe", monarchDefinition(catalog));
}

function installTheme(monaco: Monaco): void {
    monaco.editor.defineTheme("sicxe-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "sicxe-comment", foreground: "6A9955", fontStyle: "italic" },
            { token: "sicxe-instruction", foreground: "4FC1FF", fontStyle: "bold" },
            { token: "sicxe-directive", foreground: "C586C0", fontStyle: "bold" },
            { token: "sicxe-extended-instruction", foreground: "4EC9B0", fontStyle: "bold" },
            { token: "sicxe-label", foreground: "DCDCAA", fontStyle: "bold" },
            { token: "sicxe-symbol", foreground: "9CDCFE" },
            { token: "sicxe-register", foreground: "4FC1FF" },
            { token: "sicxe-missing-register-prefix", foreground: "F44747", fontStyle: "underline" },
            { token: "sicxe-invalid-register", foreground: "F44747", fontStyle: "underline" },
            { token: "sicxe-number", foreground: "B5CEA8" },
            { token: "sicxe-hex", foreground: "D7BA7D" },
            { token: "sicxe-string", foreground: "CE9178" },
            { token: "sicxe-operator", foreground: "D4D4D4" },
            { token: "sicxe-relative-mode", foreground: "DCDCAA", fontStyle: "bold" },
            { token: "sicxe-delimiter", foreground: "D4D4D4" },
        ],
        colors: {},
    });
}

function toRange(monaco: Monaco, range: LanguageRange) {
    return new monaco.Range(
        range.start.line + 1,
        range.start.character + 1,
        range.end.line + 1,
        range.end.character + 1,
    );
}

function completionKind(monaco: Monaco, kind = 14): languages.CompletionItemKind {
    switch (kind) {
        case 3: return monaco.languages.CompletionItemKind.Function;
        case 6: return monaco.languages.CompletionItemKind.Variable;
        case 14: return monaco.languages.CompletionItemKind.Keyword;
        case 21: return monaco.languages.CompletionItemKind.Constant;
        default: return monaco.languages.CompletionItemKind.Text;
    }
}

export function registerSicxeLanguage(monaco: Monaco): void {
    monacoApi = monaco;
    installTheme(monaco);
    if (!monaco.languages.getLanguages().some((language: { id: string }) => language.id === "sicxe"))
        monaco.languages.register({ id: "sicxe", extensions: [".asm", ".sic"], aliases: ["SIC/XE Assembly"] });

    installTokenizer(monaco, vocabulary);
    monaco.languages.setLanguageConfiguration("sicxe", {
        comments: { lineComment: ";" },
        brackets: [["(", ")"]],
        autoClosingPairs: [{ open: "'", close: "'", notIn: ["comment"] }],
        surroundingPairs: [["(", ")"], ["'", "'"]],
    });
    if (providersRegistered) return;
    providersRegistered = true;

    const completionProvider: CompletionProvider = {
        triggerCharacters: [" ", ",", "#", "@", "+", "$"],
        async provideCompletionItems(model, position) {
            if (!currentClient) return { suggestions: [] };
            try {
                const response = await currentClient.request<{ items: LspCompletion[] }>(
                    "textDocument/completion",
                    {
                        textDocument: { uri: model.uri.toString() },
                        position: { line: position.lineNumber - 1, character: position.column - 1 },
                    },
                );
                return {
                    suggestions: response.items.map((item) => {
                        const defaultWord = model.getWordUntilPosition(position);
                        const range = item.textEdit
                            ? toRange(monaco, item.textEdit.range)
                            : new monaco.Range(position.lineNumber, defaultWord.startColumn,
                                position.lineNumber, defaultWord.endColumn);
                        return {
                            label: item.label,
                            kind: completionKind(monaco, item.kind),
                            detail: item.detail,
                            insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
                            range,
                        };
                    }),
                };
            } catch (error) {
                console.warn("SIC/XE completion request failed:", error);
                return { suggestions: [] };
            }
        },
    };
    monaco.languages.registerCompletionItemProvider("sicxe", completionProvider);

    const hoverProvider: HoverProvider = {
        async provideHover(model, position) {
            if (!currentClient) return null;
            try {
                const response = await currentClient.request<{ contents?: { kind?: string; value?: string } } | null>(
                    "textDocument/hover",
                    {
                        textDocument: { uri: model.uri.toString() },
                        position: { line: position.lineNumber - 1, character: position.column - 1 },
                    },
                );
                if (!response?.contents?.value) return null;
                return {
                    contents: [{ value: response.contents.value }],
                    range: model.getWordAtPosition(position)
                        ? new monaco.Range(position.lineNumber,
                            model.getWordAtPosition(position)!.startColumn,
                            position.lineNumber,
                            model.getWordAtPosition(position)!.endColumn)
                        : undefined,
                };
            } catch (error) {
                console.warn("SIC/XE hover request failed:", error);
                return null;
            }
        },
    };
    monaco.languages.registerHoverProvider("sicxe", hoverProvider);

    const definitionProvider: DefinitionProvider = {
        async provideDefinition(model, position) {
            if (!currentClient) return null;
            try {
                const result = await currentClient.request<LspLocation | null>("textDocument/definition", {
                    textDocument: { uri: model.uri.toString() },
                    position: { line: position.lineNumber - 1, character: position.column - 1 },
                });
                return result ? { uri: monaco.Uri.parse(result.uri), range: toRange(monaco, result.range) } : null;
            } catch {
                return null;
            }
        },
    };
    monaco.languages.registerDefinitionProvider("sicxe", definitionProvider);

    const referenceProvider: ReferenceProvider = {
        async provideReferences(model, position, context) {
            if (!currentClient) return [];
            try {
                const result = await currentClient.request<LspLocation[]>("textDocument/references", {
                    textDocument: { uri: model.uri.toString() },
                    position: { line: position.lineNumber - 1, character: position.column - 1 },
                    context: { includeDeclaration: context.includeDeclaration },
                });
                return result.map((item) => ({ uri: monaco.Uri.parse(item.uri), range: toRange(monaco, item.range) }));
            } catch {
                return [];
            }
        },
    };
    monaco.languages.registerReferenceProvider("sicxe", referenceProvider);

    const renameProvider: RenameProvider = {
        async provideRenameEdits(model, position, newName) {
            if (!currentClient) return { edits: [], rejectReason: "Language service is disconnected" };
            try {
                const result = await currentClient.request<{ changes?: Record<string, { range: LanguageRange; newText: string }[]> } | null>(
                    "textDocument/rename",
                    {
                        textDocument: { uri: model.uri.toString() },
                        position: { line: position.lineNumber - 1, character: position.column - 1 },
                        newName,
                    },
                );
                if (!result?.changes) return { edits: [], rejectReason: "No symbol definition at this position" };
                const edits: languages.IWorkspaceTextEdit[] = [];
                for (const [uri, changes] of Object.entries(result.changes)) {
                    for (const change of changes) {
                        edits.push({
                            resource: monaco.Uri.parse(uri),
                            textEdit: { range: toRange(monaco, change.range), text: change.newText },
                            versionId: undefined,
                        });
                    }
                }
                return { edits };
            } catch (error) {
                return { edits: [], rejectReason: error instanceof Error ? error.message : "Rename failed" };
            }
        },
    };
    monaco.languages.registerRenameProvider("sicxe", renameProvider);
}
