import { DEFAULT_MACRO_SOURCE } from "./defaultMacroSource";
import { DEFAULT_MAIN_SOURCE } from "./defaultMainSource";
import { DEFAULT_LINKER_DADOS, DEFAULT_LINKER_MAXIMO, DEFAULT_LINKER_PROG } from "./defaultLinkerSources";

// The files of a new project, of the project made on a first visit, and of a
// stored project that has none: the syntax tour, the macro tour and the linker
// tour (three files, which start switched off for linking). Each call
// returns a new object, so no two projects share one.
export function defaultProjectFiles(): Record<string, string> {
    return {
        "main.asm": DEFAULT_MAIN_SOURCE,
        "macro.asm": DEFAULT_MACRO_SOURCE,
        "linker/prog.asm": DEFAULT_LINKER_PROG,
        "linker/maximo.asm": DEFAULT_LINKER_MAXIMO,
        "linker/dados.asm": DEFAULT_LINKER_DADOS,
    };
}
