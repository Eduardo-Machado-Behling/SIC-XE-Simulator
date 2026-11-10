import type { MacroReport } from "./ExecutionEvent";

export const MACRO_OUTPUT_FILE = "MASMAPRG.ASM";

export function isGeneratedFile(path: string): boolean {
    return path === MACRO_OUTPUT_FILE;
}

function hasDirective(source: string, directive: "START" | "END"): boolean {
    return source.split(/\r?\n/).some((line) => {
        const code = line.replace(/;.*/, "").trim();
        if (!code || code.startsWith(".")) return false;
        const tokens = code.split(/\s+/);
        return tokens[0]?.toUpperCase() === directive || tokens[1]?.toUpperCase() === directive;
    });
}

export function entryPointFile(files: Record<string, string>, architecture?: string): string {
    const paths = Object.keys(files).filter((path) => !isGeneratedFile(path)).sort();
    const namedSources = paths.filter((path) => /\.(asm|sic|sicxe|sxe|s)$/i.test(path));
    const assemblySources = namedSources.length > 0
        ? namedSources
        : paths.filter((path) => hasDirective(files[path], "START") || hasDirective(files[path], "END"));
    const isSicxe = architecture?.toLowerCase().replace(/[^a-z0-9]/g, "") === "sicxe";
    const sources = assemblySources.length > 0 ? assemblySources : isSicxe ? [] : paths;
    return sources.find((path) => hasDirective(files[path], "START")) ??
        sources.find((path) => hasDirective(files[path], "END")) ??
        sources.find((path) => /(^|\/)main\.(asm|sic|sicxe|sxe|s)$/i.test(path)) ??
        sources[0] ?? (isSicxe ? "" : paths[0] ?? "");
}

export function applyMacroReport(
    files: Record<string, string>,
    report: MacroReport | null,
): Record<string, string> {
    if (!report) return files;
    if (report.hasMacros) return { ...files, [MACRO_OUTPUT_FILE]: report.text };
    if (!(MACRO_OUTPUT_FILE in files)) return files;
    const rest = { ...files };
    delete rest[MACRO_OUTPUT_FILE];
    return rest;
}

export function canRename(path: string): boolean {
    return !isGeneratedFile(path);
}

export function canMove(path: string): boolean {
    return !isGeneratedFile(path);
}

export function canCreate(path: string): boolean {
    return path.toUpperCase() !== MACRO_OUTPUT_FILE;
}
