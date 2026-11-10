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
            expect(find(state, "MCDEFN")?.[2]).toBe("@macroBody");
            }
        // Only macroBody pops; a root MCEND has no next state (popping an empty stack throws in Monarch).
        expect(find("macroBody", "MCEND")?.[2]).toBe("@pop");
        expect(find("root", "MCEND")?.[2]).toBeUndefined();
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

        // Minimal Monarch-semantics stepper: first matching rule wins, "@name" pushes and enters
        // name, "@pop" pops and throws on an empty stack, like monarchLexer.
        const lex = (text: string) => {
            const stack = ["root"];
            const out: [string, string][] = [];
            for (const line of text.split("\n")) {
                let pos = 0;
                while (pos < line.length) {
                    const rest = line.slice(pos);
                    let hit = false;
                    for (const rule of states[stack[stack.length - 1]] as [RegExp, unknown, string?][]) {
                        const re = new RegExp(`^(?:${rule[0].source})`, rule[0].flags.replace("g", ""));
                        const m = re.exec(rest);
                        if (!m || (m[0].length === 0)) continue;
                        // Mirror Monarch's ^ handling: anchored rules only match at line start.
                        if (rule[0].source.startsWith("^") && pos !== 0) continue;
                        const action = rule[1] as string | { cases: Record<string, string> };
                        let token: string;
                        if (typeof action === "string") token = action;
                        else {
                            const word = m[0];
                            const key = Object.keys(action.cases).find((k) => k !== "@default"
                                && definition[k.slice(1)].some((w: string) => w.toLowerCase() === word.toLowerCase()));
                            token = action.cases[key ?? "@default"];
                        }
                        out.push([m[0], token]);
                        const next = rule[2];
                        if (next === "@pop") {
                            if (stack.length <= 1) throw new Error("trying to pop an empty stack");
                            stack.pop();
                        } else if (next) stack.push(next.slice(1));
                        pos += m[0].length;
                        hit = true;
                        break;
                    }
                    if (!hit) pos += 1;
                }
            }
            return { out, depth: stack.length };
        };
        const tokenOf = (out: [string, string][], text: string) => out.find(([t]) => t === text)?.[1];

        const body = lex("M MCDEFN\n LDA A\n MCEND\n LDA A");
        const bodyA = body.out.filter(([t]) => t === "A");
        expect(bodyA[0][1]).toBe("sicxe-symbol"); // inside the body
        expect(bodyA[1][1]).toBe("sicxe-missing-register-prefix"); // after MCEND
        expect(body.depth).toBe(1);
        // Nested definitions balance.
        expect(lex("M MCDEFN\nN MCDEFN\n MCEND\n LDA A\n MCEND").out.filter(([t]) => t === "A")[0][1])
            .toBe("sicxe-symbol");
        expect(lex("M MCDEFN\nN MCDEFN\n MCEND\n MCEND\n").depth).toBe(1);
        // A stray MCEND does not throw.
        expect(() => lex(" MCEND\n LDA A")).not.toThrow();
        expect(tokenOf(lex(" MCEND").out, "MCEND")).toBe("sicxe-directive");
        // MCEND.SER is a serial label, not MCEND: it neither pops nor pushes.
        const serial = lex("M MCDEFN\nMCEND.SER LDA A\nMCDEFN.SER LDA A");
        expect(serial.depth).toBe(2);
        expect(serial.out.find(([t]) => t === "MCEND.SER")?.[1]).toBe("sicxe-macro-marker");
        expect(serial.out.filter(([t]) => t === "A").map(([, k]) => k)).toEqual(["sicxe-symbol", "sicxe-symbol"]);
        // A whole-token MCEND still pops when followed by a comment or end of line.
        expect(lex("M MCDEFN\n MCEND;done").depth).toBe(1);
        expect(lex("M MCDEFN\n MCEND").depth).toBe(1);

        setAssemblerLanguageClient(null);
    });

    it("highlights catalog-provided macroDirectives as directives", () => {
        const tokenizer = vi.fn();
        const noop = vi.fn();
        setAssemblerLanguageClient({
            onCatalog: (listener: (value: LanguageCatalog) => void) => {
                listener({ instructions: ["LDA"], directives: ["START"], registers: ["A"], macroDirectives: ["MCFOO"] });
                return () => {};
            },
        } as unknown as AssemblerLanguageClient);
        registerSicxeLanguage({
            editor: { defineTheme: noop },
            languages: {
                getLanguages: () => [{ id: "sicxe" }],
                register: noop,
                setMonarchTokensProvider: tokenizer,
                setLanguageConfiguration: noop,
            },
        } as unknown as Monaco);
        const definition = tokenizer.mock.calls[0][1];
        expect(definition.macroDirectives).toEqual(expect.arrayContaining(["MCFOO", "MCDEFN", "MCEND"]));
        for (const state of ["root", "macroBody"]) {
            const referenced = (definition.tokenizer[state] as unknown[]).some(
                (rule) => JSON.stringify(Array.isArray(rule) ? rule[1] : "").includes("@macroDirectives"));
            expect(referenced).toBe(true);
        }
        setAssemblerLanguageClient(null);
    });
});
