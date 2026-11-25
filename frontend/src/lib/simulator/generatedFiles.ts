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

// The extensions of an assembly source, written once for the three patterns.
const SOURCE_EXTENSIONS = "(asm|sic|sicxe|sxe|s)";
const SOURCE_PATH = new RegExp(`\\.${SOURCE_EXTENSIONS}$`, "i");
const MAIN_IN_ANY_FOLDER = new RegExp(`(^|/)main\\.${SOURCE_EXTENSIONS}$`, "i");
const ROOT_MAIN = new RegExp(`^main\\.${SOURCE_EXTENSIONS}$`, "i");

// The files Run may assemble, sorted: never the generated file; the files with
// an assembly extension, else those with START or END, else (except on SIC/XE)
// every file.
function runnableSources(files: Record<string, string>, architecture?: string): string[] {
    const paths = Object.keys(files).filter((path) => !isGeneratedFile(path)).sort();
    const namedSources = paths.filter((path) => SOURCE_PATH.test(path));
    const assemblySources = namedSources.length > 0
        ? namedSources
        : paths.filter((path) => hasDirective(files[path], "START") || hasDirective(files[path], "END"));
    const isSicxe = architecture?.toLowerCase().replace(/[^a-z0-9]/g, "") === "sicxe";
    return assemblySources.length > 0 ? assemblySources : isSicxe ? [] : paths;
}

export function entryPointFile(files: Record<string, string>, architecture?: string): string {
    const sources = runnableSources(files, architecture);
    return sources.find((path) => hasDirective(files[path], "START")) ??
        sources.find((path) => hasDirective(files[path], "END")) ??
        sources.find((path) => MAIN_IN_ANY_FOLDER.test(path)) ??
        sources[0] ?? "";
}

// The file Run assembles: the open file when it is a runnable source. With
// MASMAPRG.ASM or another non-source open, the file the last Run assembled,
// while it still exists. Otherwise the entry point.
export function fileToRun(
    files: Record<string, string>,
    activeFile: string,
    lastRunFile: string | null,
    architecture?: string,
): string {
    if (runnableSources(files, architecture).includes(activeFile)) return activeFile;
    if (lastRunFile && !isGeneratedFile(lastRunFile) && Object.hasOwn(files, lastRunFile)) return lastRunFile;
    return entryPointFile(files, architecture);
}

// The file the editor opens with a project, or after the open file is
// deleted: the root main.<asm|sic|sicxe|sxe|s>, else the entry point.
export function fileToOpen(files: Record<string, string>, architecture?: string): string {
    return runnableSources(files, architecture).find((path) => ROOT_MAIN.test(path)) ??
        entryPointFile(files, architecture);
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

// ---- Stage 4: the files Run links -------------------------------------------------

/** A file that can take part in a link: an assembly source, not generated, not a hex dump. */
export function canLink(path: string, files: Record<string, string>): boolean {
    return Object.hasOwn(files, path) && !isGeneratedFile(path) && SOURCE_PATH.test(path) &&
        !(files[path] ?? "").startsWith(";");
}

/** The source holds the ENTRY directive (`PROG ENTRY 0`), not a label named ENTRY. */
export function isEntryFile(source: string): boolean {
    return source.split(/\r?\n/).some((line) => {
        if (line.startsWith(".")) return false;
        const code = line.replace(/;.*/, "");
        const tokens = code.trim().split(/\s+/);
        if (tokens[1]?.toUpperCase() === "ENTRY") return true;
        // Without a label the directive is the first field, and the line starts with a space.
        return /^\s/.test(code) && tokens[0]?.toUpperCase() === "ENTRY";
    });
}

/**
 * The files a Run loads, in link order. With no file switched on, the file Run always
 * assembled (fileToRun). Otherwise exactly the switched-on files that still exist: the
 * ENTRY file first, then path order. The open file is never added.
 */
export function filesToLink(
    files: Record<string, string>,
    linkSet: string[],
    activeFile: string,
    lastRunFile: string | null,
    architecture?: string,
): string[] {
    const chosen = [...new Set(linkSet)].filter((path) => canLink(path, files));
    if (chosen.length === 0) {
        const single = fileToRun(files, activeFile, lastRunFile, architecture);
        return single ? [single] : [];
    }
    const rank = (path: string) => (isEntryFile(files[path]) ? 0 : 1);
    return chosen.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** The link set after `from` (a file or a folder) was renamed or moved to `to`. */
export function renameInLinkSet(linkSet: string[], from: string, to: string): string[] {
    return linkSet.map((path) =>
        path === from ? to : path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path,
    );
}

/** The link set after `removed` (a file or a folder) was deleted. */
export function dropFromLinkSet(linkSet: string[], removed: string): string[] {
    return linkSet.filter((path) => path !== removed && !path.startsWith(`${removed}/`));
}

/** A hexadecimal load address inside a memory of `memorySize` bytes; "" is 0; else null. */
export function parseLoadAddress(text: string, memorySize: number): number | null {
    const digits = text.trim();
    if (digits === "") return 0;
    if (!/^[0-9a-f]+$/i.test(digits)) return null;
    const address = Number.parseInt(digits, 16);
    return address < memorySize ? address : null;
}
