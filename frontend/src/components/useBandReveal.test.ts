import { renderHook } from "@testing-library/react";
import type { OnMount } from "@monaco-editor/react";
import { describe, expect, it, vi } from "vitest";

import { useBandReveal } from "@/components/useBandReveal";
import { macroBands } from "@/lib/simulator/macroBands";
import { macroReportFixture } from "@/lib/simulator/macroFixtures";

type MountedEditor = Parameters<OnMount>[0];
type Monaco = Parameters<OnMount>[1];

function fakeEditor() {
    const disposeListeners: (() => void)[] = [];
    const editor = {
        revealLineInCenter: vi.fn(),
        onDidDispose: (listener: () => void) => {
            disposeListeners.push(listener);
            return { dispose() {} };
        },
    };
    return {
        editor,
        mounted: editor as unknown as MountedEditor,
        dispose: () => disposeListeners.forEach((listener) => listener()),
    };
}

const monaco = {} as Monaco;
const bands = macroBands(macroReportFixture);

describe("useBandReveal", () => {
    it("scrolls the other editor to the band clicked on this side", () => {
        const source = fakeEditor();
        const output = fakeEditor();
        const { result } = renderHook(() => useBandReveal(bands));
        result.current.trackSource(source.mounted, monaco);
        result.current.trackOutput(output.mounted, monaco);

        result.current.showOutputBand(1);
        expect(output.editor.revealLineInCenter).toHaveBeenCalledWith(8);

        result.current.showSourceBand(1);
        expect(source.editor.revealLineInCenter).toHaveBeenCalledWith(14);
    });

    it("scrolls an editor to a given line", () => {
        const source = fakeEditor();
        const output = fakeEditor();
        const { result } = renderHook(() => useBandReveal(null));
        result.current.trackSource(source.mounted, monaco);
        result.current.trackOutput(output.mounted, monaco);

        result.current.revealSourceLine(13);
        result.current.revealOutputLine(4);

        expect(source.editor.revealLineInCenter).toHaveBeenCalledWith(13);
        expect(output.editor.revealLineInCenter).toHaveBeenCalledWith(4);
    });

    it("does nothing once the other editor is gone or there are no bands", () => {
        const output = fakeEditor();
        const { result, rerender } = renderHook(({ current }) => useBandReveal(current), {
            initialProps: { current: bands as typeof bands | null },
        });
        result.current.trackOutput(output.mounted, monaco);
        output.dispose();
        result.current.showOutputBand(0);

        const later = fakeEditor();
        result.current.trackOutput(later.mounted, monaco);
        rerender({ current: null });
        result.current.showOutputBand(0);

        expect(output.editor.revealLineInCenter).not.toHaveBeenCalled();
        expect(later.editor.revealLineInCenter).not.toHaveBeenCalled();
    });
});
