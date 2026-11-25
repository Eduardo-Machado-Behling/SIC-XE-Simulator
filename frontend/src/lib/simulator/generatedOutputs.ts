// What the right-hand pane shows for the open file after a Run: its macro output, its
// object program (.obj) and the linked program (.out), which every file shows.

import type { ExecutionEvent, LinkReport, MacroReport } from "@/lib/simulator/ExecutionEvent";
import { MACRO_OUTPUT_FILE } from "@/lib/simulator/generatedFiles";

export type GeneratedTabId = "macro" | "obj" | "out";

export interface GeneratedTab {
    id: GeneratedTabId;
    label: string;
    text: string;
}

const stemOf = (path: string) => (path.split("/").at(-1) ?? path).replace(/\.[^.]*$/, "");
const withoutExtension = (path: string) => path.replace(/\.[^./]*$/, "");

/** "main.asm" -> "main.obj"; with two sources of the same stem, the folder too: "a/x.obj". */
export function objectFileName(source: string, sources: string[]): string {
    const stem = stemOf(source);
    const shared = sources.some((other) => other !== source && stemOf(other) === stem);
    return `${shared ? withoutExtension(source) : stem}.obj`;
}

/** The tabs of the open file, in order: MASMAPRG.ASM, <file>.obj, <program>.out. */
export function generatedTabs(
    activeSource: string,
    macroReports: Record<string, MacroReport>,
    link: LinkReport | null,
): GeneratedTab[] {
    const tabs: GeneratedTab[] = [];
    const macro = macroReports[activeSource];
    if (macro?.hasMacros) tabs.push({ id: "macro", label: MACRO_OUTPUT_FILE, text: macro.text });
    const object = link?.objects.find((item) => item.source === activeSource);
    if (link && object) {
        tabs.push({ id: "obj", label: objectFileName(activeSource, link.objects.map((item) => item.source)), text: object.text });
    }
    if (link && link.out.text) tabs.push({ id: "out", label: `${link.out.name || "program"}.out`, text: link.out.text });
    return tabs;
}

/** One macro report per file of a Run; a report without a source belongs to `runFile`. */
export function macroReportsBySource(events: ExecutionEvent[], runFile: string): Record<string, MacroReport> {
    const reports: Record<string, MacroReport> = {};
    for (const event of events) {
        if (event.type === "MacrosExpanded") reports[event.details.source ?? runFile] = event.details;
    }
    return reports;
}
