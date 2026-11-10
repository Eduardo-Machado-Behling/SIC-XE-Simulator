import { describe, expect, it, vi } from "vitest";
import type { Monaco } from "@monaco-editor/react";

import { registerSicxeLanguage, setAssemblerLanguageClient } from "@/lib/language/sicxeLanguage";
import type { AssemblerLanguageClient, LanguageCatalog } from "@/lib/language/LanguageClient";

describe("Monaco SIC/XE registration", () => {
    it("registers syntax, completion, hover, navigation, and rename providers from the server vocabulary", () => {
        const calls = {
            register: vi.fn(),
            tokenizer: vi.fn(),
            theme: vi.fn(),
            configuration: vi.fn(),
            completion: vi.fn(),
            hover: vi.fn(),
            definition: vi.fn(),
            references: vi.fn(),
            rename: vi.fn(),
        };
        const catalog: LanguageCatalog = {
            instructions: ["LDA"],
            directives: ["START"],
            registers: ["A"],
        };
        const fakeClient = {
            onCatalog: (listener: (value: LanguageCatalog) => void) => {
                listener(catalog);
                return () => {};
            },
        } as unknown as AssemblerLanguageClient;
        setAssemblerLanguageClient(fakeClient);

        const monaco = {
            editor: { defineTheme: calls.theme },
            languages: {
                getLanguages: () => [],
                register: calls.register,
                setMonarchTokensProvider: calls.tokenizer,
                setLanguageConfiguration: calls.configuration,
                registerCompletionItemProvider: calls.completion,
                registerHoverProvider: calls.hover,
                registerDefinitionProvider: calls.definition,
                registerReferenceProvider: calls.references,
                registerRenameProvider: calls.rename,
            },
        } as unknown as Monaco;
        registerSicxeLanguage(monaco);

        expect(calls.register).toHaveBeenCalledWith(expect.objectContaining({ id: "sicxe" }));
        expect(calls.tokenizer).toHaveBeenCalledWith("sicxe", expect.objectContaining({
            ignoreCase: true,
            instructions: ["LDA"],
            directives: ["START"],
            registers: ["A"],
        }));
        expect(calls.theme).toHaveBeenCalledWith("sicxe-dark", expect.objectContaining({
            base: "vs-dark",
            inherit: true,
        }));
        expect(calls.configuration).toHaveBeenCalledWith("sicxe", expect.any(Object));
        expect(calls.completion).toHaveBeenCalledTimes(1);
        expect(calls.hover).toHaveBeenCalledTimes(1);
        expect(calls.definition).toHaveBeenCalledTimes(1);
        expect(calls.references).toHaveBeenCalledTimes(1);
        expect(calls.rename).toHaveBeenCalledTimes(1);
        setAssemblerLanguageClient(null);
    });

    it("tokenizes macro definitions: nesting body state, markers, directives and body registers", () => {
        const tokenizer = vi.fn();
        const theme = vi.fn();
        const noop = vi.fn();
        // Catalog without macroDirectives: today's server.
        setAssemblerLanguageClient({
            onCatalog: (listener: (value: LanguageCatalog) => void) => {
                listener({ instructions: ["LDA"], directives: ["START"], registers: ["A"] });
                return () => {};
            },
        } as unknown as AssemblerLanguageClient);
        registerSicxeLanguage({
            editor: { defineTheme: theme },
            languages: {
                getLanguages: () => [{ id: "sicxe" }],
                register: noop,
                setMonarchTokensProvider: tokenizer,
                setLanguageConfiguration: noop,
            },
        } as unknown as Monaco);
        const definition = tokenizer.mock.calls[0][1];
        const states = definition.tokenizer as Record<string, unknown[]>;

        expect(Object.keys(states)).toEqual(expect.arrayContaining(["root", "macroBody"]));
        const find = (state: string, word: string) =>
            states[state].find((rule) => Array.isArray(rule) && rule[0] instanceof RegExp
                && rule[0].test(word) && rule[0].source.toLowerCase().includes(word.toLowerCase())) as unknown[];
        for (const state of ["root", "macroBody"]) {
            expect(find(state, "MCDEFN")?.[1]).toBe("sicxe-directive");
            expect(find(state, "MCDEFN")?.[2]).toBe("@push");
            expect(find(state, "MCEND")?.[2]).toBe("@pop");
        }
        // Reserved even when the catalog lacks the field.
        expect(definition.macroDirectives).toEqual(expect.arrayContaining(["MCDEFN", "MCEND"]));

        const markerRules = (state: string) => states[state].filter(
            (rule) => Array.isArray(rule) && rule[1] === "sicxe-macro-marker") as [RegExp, string][];
        for (const state of ["root", "macroBody"]) {
            const rules = markerRules(state);
            expect(rules.some(([re]) => new RegExp(`^(?:${re.source})$`, "i").test("LOOP.SER"))).toBe(true);
            expect(rules.some(([re]) => new RegExp(`^(?:${re.source})$`, "i").test(".LOOP"))).toBe(true);
        }

        // Comment rules come first: column-1 '.' is a comment, not a marker.
        expect((states.macroBody[0] as [RegExp, string])[1]).toBe("sicxe-comment");
        expect((states.root[0] as [RegExp, string])[1]).toBe("sicxe-comment");

        const registerCase = (state: string) => {
            const rule = states[state].find((r) => Array.isArray(r) && (r[1] as { cases?: Record<string, string> })?.cases?.["@registers"] !== undefined
                || (Array.isArray(r) && JSON.stringify(r[1]).includes("@default") && JSON.stringify(r[1]).includes("sicxe-symbol")
                    && JSON.stringify(r[1]).includes("@instructions") && !JSON.stringify(r[1]).includes("sicxe-label")));
            return (rule as [RegExp, { cases: Record<string, string> }])[1].cases;
        };
        expect(registerCase("root")["@registers"]).toBe("sicxe-missing-register-prefix");
        expect(registerCase("macroBody")["@registers"]).toBeUndefined();
        expect(registerCase("macroBody")["@default"]).toBe("sicxe-symbol");

        expect(theme).toHaveBeenCalledWith("sicxe-dark", expect.objectContaining({
            rules: expect.arrayContaining([expect.objectContaining({ token: "sicxe-macro-marker" })]),
        }));
        setAssemblerLanguageClient(null);
    });
});
