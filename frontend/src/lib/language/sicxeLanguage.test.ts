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
});
