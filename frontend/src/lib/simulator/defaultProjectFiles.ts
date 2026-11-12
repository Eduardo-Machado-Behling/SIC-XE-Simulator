import { DEFAULT_MACRO_SOURCE } from "./defaultMacroSource";
import { DEFAULT_MAIN_SOURCE } from "./defaultMainSource";

// The files of a new project, of the project made on a first visit, and of a
// stored project that has none: the syntax tour and the macro tour. Each call
// returns a new object, so no two projects share one.
export function defaultProjectFiles(): Record<string, string> {
    return { "main.asm": DEFAULT_MAIN_SOURCE, "macro.asm": DEFAULT_MACRO_SOURCE };
}
