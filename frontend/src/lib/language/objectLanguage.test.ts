import { describe, expect, it, vi } from "vitest";

import { OBJECT_LANGUAGE_ID, registerObjectLanguage } from "./objectLanguage";

function fakeMonaco(known: string[] = []) {
    return {
        languages: {
            getLanguages: () => known.map((id) => ({ id })),
            register: vi.fn(),
            setMonarchTokensProvider: vi.fn(),
        },
    };
}

describe("registerObjectLanguage", () => {
    it("registers the .obj/.out language with a Monarch tokenizer", () => {
        const monaco = fakeMonaco();
        registerObjectLanguage(monaco as never);
        expect(OBJECT_LANGUAGE_ID).toBe("sicxe-object");
        expect(monaco.languages.register).toHaveBeenCalledWith(expect.objectContaining({ id: "sicxe-object" }));
        expect(monaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
            "sicxe-object", expect.objectContaining({ tokenizer: expect.objectContaining({ root: expect.any(Array) }) }));
    });

    it("registers the language once when several editors mount", () => {
        const monaco = fakeMonaco(["sicxe-object"]);
        registerObjectLanguage(monaco as never);
        expect(monaco.languages.register).not.toHaveBeenCalled();
    });
});
