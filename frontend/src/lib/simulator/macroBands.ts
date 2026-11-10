import type { editor } from "monaco-editor";

import type { MacroExpansion, MacroReport } from "./ExecutionEvent";
import { isGeneratedFile } from "./generatedFiles";

// A coloured run of editor lines, 1-based and inclusive.
export interface EditorBand {
    from: number;
    to: number;
    colorIndex: number;
}

// The same expansion has the same index in both lists.
export interface MacroBands {
    source: EditorBand[];
    output: EditorBand[];
}

// One CSS class per colour, `.macro-band-0` to `.macro-band-5` in globals.css.
const BAND_COLORS = 6;

// Shared so that editors without bands get the same array on every render.
export const NO_BANDS: EditorBand[] = [];

// Top-level calls that have a band. An inverted output range (a limit error
// on the call's comment line) has nothing to colour, so it gets none.
function bandedExpansions(report: MacroReport): MacroExpansion[] {
    return report.expansions.filter((expansion) =>
        expansion.parent === null && expansion.output.from <= expansion.output.to);
}

// One colour per top-level call: its call line in the source and its whole
// output block (nested calls included) in MASMAPRG.ASM.
export function macroBands(report: MacroReport): MacroBands {
    const topLevel = bandedExpansions(report);
    return {
        source: topLevel.map((expansion, index) => ({
            from: expansion.callLine, to: expansion.callLine, colorIndex: index % BAND_COLORS,
        })),
        output: topLevel.map((expansion, index) => ({
            from: expansion.output.from, to: expansion.output.to, colorIndex: index % BAND_COLORS,
        })),
    };
}

// Where to scroll the two panes for one expansion. Nested expansions have no
// band of their own: they reveal their own output and the call line of the
// outermost call that contains them. `bandIndex` is the expansion's band when
// it is a top-level call, else null.
export interface ExpansionReveal {
    outputLine: number;
    sourceLine: number;
    bandIndex: number | null;
}

export function expansionReveal(report: MacroReport, serial: number): ExpansionReveal | null {
    const expansion = report.expansions.find((candidate) => candidate.serial === serial);
    if (!expansion) return null;
    let root = expansion;
    for (let hops = 0; root.parent !== null && hops <= report.expansions.length; hops++) {
        const parent = report.expansions.find((candidate) => candidate.serial === root.parent);
        if (!parent) break;
        root = parent;
    }
    const bandIndex = expansion === root ? bandedExpansions(report).indexOf(root) : -1;
    return {
        outputLine: expansion.output.from,
        sourceLine: root.callLine,
        bandIndex: bandIndex < 0 ? null : bandIndex,
    };
}

// A run of editor lines, 1-based and inclusive.
export interface LineRange {
    from: number;
    to: number;
}

// What a click on an expansion row marks: its own output block in
// MASMAPRG.ASM (a nested call marks only its own lines, not its band) and, in
// the source, the call line of the outermost call that contains it.
export interface ExpansionHighlight {
    output: LineRange;
    source: LineRange;
}

// An inverted output range gets no mark, as it gets no band.
export function expansionHighlight(report: MacroReport, serial: number): ExpansionHighlight | null {
    const expansion = report.expansions.find((candidate) => candidate.serial === serial);
    const reveal = expansionReveal(report, serial);
    if (!expansion || !reveal || expansion.output.from > expansion.output.to) return null;
    return {
        output: { from: expansion.output.from, to: expansion.output.to },
        source: { from: reveal.sourceLine, to: reveal.sourceLine },
    };
}

// Source line a MASMAPRG.ASM line came from: its own line when copied, else
// the line of the outermost call that produced it.
export function sourceLineForOutput(report: MacroReport, outputLine: number): number | null {
    return report.lineMap[outputLine - 1]?.source ?? null;
}

// Index of the band covering `line`, or -1.
export function bandAt(bands: EditorBand[], line: number): number {
    return bands.findIndex((band) => line >= band.from && line <= band.to);
}

function wholeLines(from: number, to: number) {
    return { startLineNumber: from, startColumn: 1, endLineNumber: to, endColumn: 1 };
}

export function bandDecorations(bands: EditorBand[]): editor.IModelDeltaDecoration[] {
    return bands.map((band) => ({
        range: wholeLines(band.from, band.to),
        options: {
            isWholeLine: true,
            className: `macro-band-${band.colorIndex}`,
            linesDecorationsClassName: `macro-band-${band.colorIndex} macro-band-stripe`,
        },
    }));
}

export function secondaryLineDecoration(line: number): editor.IModelDeltaDecoration {
    return {
        range: wholeLines(line, line),
        options: { isWholeLine: true, className: "sicxe-secondary-line" },
    };
}

export function selectedExpansionDecoration(range: LineRange): editor.IModelDeltaDecoration {
    return {
        range: wholeLines(range.from, range.to),
        options: { isWholeLine: true, className: "macro-band-selected" },
    };
}

// The side-by-side view of the last Run.
export interface MacroViewState {
    // Entry file of that Run: the only file that gets the source bands and
    // the secondary line.
    sourceFile: string | null;
    // Null when that Run had no macros, or once its entry file was edited.
    bands: MacroBands | null;
}

export const NO_MACRO_VIEW: MacroViewState = { sourceFile: null, bands: null };

export function macroViewForRun(report: MacroReport | null, sourceFile: string): MacroViewState {
    return { sourceFile, bands: report?.hasMacros ? macroBands(report) : null };
}

// Review Focus 5: editing the entry file makes its line numbers stale, so the
// bands go (and the secondary line with them) at once, like the executing line.
export function clearMacroViewOnEdit(state: MacroViewState, editedPath: string): MacroViewState {
    if (editedPath !== state.sourceFile || state.bands === null) return state;
    return { ...state, bands: null };
}

export interface EditorDecorations {
    bands: EditorBand[];
    executingLine: number | null;
    secondaryLine: number | null;
    // Lines of the expansion selected in the Expansions table.
    selectedLines: LineRange | null;
}

export interface DecorationContext {
    report: MacroReport | null;
    view: MacroViewState;
    // InstructionFetched.source_line: a line of the file the last Run assembled.
    executingLine: number | null;
    // Entry file of the last Run.
    executionSourceFile: string | null;
    // Serial of the expansion selected in the Expansions table, if any.
    selectedExpansion?: number | null;
}

// What the editor showing `path` highlights. After a Run with macros the
// assembled text is MASMAPRG.ASM, so the executing line is lit there and the
// entry file gets the source line it came from as a secondary highlight.
export function editorDecorations(path: string, context: DecorationContext): EditorDecorations {
    const { report, view, executingLine } = context;
    if (!report?.hasMacros) {
        return {
            bands: NO_BANDS,
            executingLine: path === context.executionSourceFile ? executingLine : null,
            secondaryLine: null,
            selectedLines: null,
        };
    }
    // The selection goes with the bands once the entry file is edited.
    const selected = view.bands && context.selectedExpansion != null
        ? expansionHighlight(report, context.selectedExpansion)
        : null;
    if (isGeneratedFile(path)) {
        return {
            bands: view.bands?.output ?? NO_BANDS,
            executingLine,
            secondaryLine: null,
            selectedLines: selected?.output ?? null,
        };
    }
    if (path === view.sourceFile && view.bands) {
        return {
            bands: view.bands.source,
            executingLine: null,
            secondaryLine: executingLine === null ? null : sourceLineForOutput(report, executingLine),
            selectedLines: selected?.source ?? null,
        };
    }
    return { bands: NO_BANDS, executingLine: null, secondaryLine: null, selectedLines: null };
}

// A line of the source or of MASMAPRG.ASM that a trace step points at.
export type TraceLine = { file: "source" | "output"; line: number };
