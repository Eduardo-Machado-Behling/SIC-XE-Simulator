import type { OnMount } from "@monaco-editor/react";
import { useMemo, useRef, type RefObject } from "react";

import type { EditorBand, MacroBands } from "@/lib/simulator/macroBands";

type MountedEditor = Parameters<OnMount>[0];

function track(ref: RefObject<MountedEditor | null>, instance: MountedEditor): void {
    ref.current = instance;
    instance.onDidDispose(() => {
        if (ref.current === instance) ref.current = null;
    });
}

function reveal(instance: MountedEditor | null, band: EditorBand | undefined): void {
    if (instance && band) instance.revealLineInCenter(band.from);
}

function revealLine(instance: MountedEditor | null, line: number): void {
    instance?.revealLineInCenter(line);
}

// Links the source and MASMAPRG.ASM editors of the side-by-side view: a click
// on band i on one side scrolls the other side to its band i.
export function useBandReveal(bands: MacroBands | null) {
    const sourceEditor = useRef<MountedEditor | null>(null);
    const outputEditor = useRef<MountedEditor | null>(null);

    return useMemo(() => ({
        trackSource: ((instance) => track(sourceEditor, instance)) as OnMount,
        trackOutput: ((instance) => track(outputEditor, instance)) as OnMount,
        showSourceBand: (index: number) => reveal(sourceEditor.current, bands?.source[index]),
        showOutputBand: (index: number) => reveal(outputEditor.current, bands?.output[index]),
        revealSourceLine: (line: number) => revealLine(sourceEditor.current, line),
        revealOutputLine: (line: number) => revealLine(outputEditor.current, line),
        outputMounted: () => outputEditor.current !== null,
    }), [bands]);
}
