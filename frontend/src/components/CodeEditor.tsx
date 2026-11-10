"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useState, type ReactNode } from "react";
import type { editor } from "monaco-editor";
import { File, X } from "lucide-react";

import type {
    AssemblerLanguageClient,
} from "@/lib/language/LanguageClient";
import { toMonacoMarker } from "@/lib/language/monacoDiagnostics";
import { registerSicxeLanguage } from "@/lib/language/sicxeLanguage";
import {
    bandAt,
    bandDecorations,
    NO_BANDS,
    secondaryLineDecoration,
    selectedExpansionDecoration,
    type EditorBand,
    type LineRange,
} from "@/lib/simulator/macroBands";

// ============================================================
// Types
// ============================================================

export type CodeEditorProps = {
    /** Path of the file currently open, shown in the tab. */
    path: string;
    /** Current file content. */
    value: string;
    /** Monaco language id to use for syntax highlighting. */
    language: string;
    /** Stable Monaco URI for the active source document. */
    documentUri?: string;
    /** Optional language service client for SIC/XE source files. */
    languageClient?: AssemblerLanguageClient | null;
    /** 1-based source line of the instruction currently fetched by the CPU. */
    executingLine?: number | null;
    /** Address of the fetched instruction, shown in the marker tooltip. */
    executingAddress?: number | null;
    /** Coloured macro expansion bands (see macroBands). */
    bands?: EditorBand[];
    /** 1-based line lit as the source of the executing MASMAPRG.ASM line. */
    secondaryLine?: number | null;
    /** Lines of the expansion selected in the Macros tab, marked over the bands. */
    selectedLines?: LineRange | null;
    /** Called with the index in `bands` of the band the user clicked. */
    onBandClick?: (index: number) => void;
    /** Extra controls at the right end of the tab bar. */
    headerActions?: ReactNode;
    /** Called with the new content on every edit. */
    onChange: (value: string) => void;
    /** Called when the user closes the tab. Omit to hide the close button. */
    onCloseTab?: () => void;
    /** Called once Monaco has mounted, useful for registering custom languages. */
    onMount?: OnMount;
    /** Blocks edits and shows the generated badge in the tab header. */
    readOnly?: boolean;
    /** Editor theme. Defaults to "vs-dark". */
    theme?: string;
};

// ============================================================
// CodeEditor
// ============================================================

export function CodeEditor({
    path,
    value,
    language,
    documentUri,
    languageClient,
    onChange,
    executingLine = null,
    executingAddress = null,
    bands = NO_BANDS,
    secondaryLine = null,
    selectedLines = null,
    onBandClick,
    headerActions,
    onCloseTab,
    onMount,
    readOnly = false,
    theme = "vs-dark",
}: CodeEditorProps) {
    const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
    const [monacoInstance, setMonacoInstance] = useState<Parameters<OnMount>[1] | null>(null);

    useEffect(() => {
        if (language !== "sicxe" || !documentUri || !languageClient || !editorInstance || !monacoInstance)
            return;
        const model = editorInstance.getModel();
        if (!model) return;

        const markerOwner = "sicxe-language-server";
        const publish = languageClient.onDiagnostics(documentUri, (diagnostics) => {
            if (model.isDisposed()) return;
            monacoInstance.editor.setModelMarkers(
                model,
                markerOwner,
                diagnostics.map((item) => toMonacoMarker(monacoInstance, item)),
            );
        });
        const changes = model.onDidChangeContent(() => {
            languageClient.changeDocument(documentUri, model.getValue());
        });
        void languageClient.openDocument(documentUri, model.getValue()).catch((error: unknown) => {
            console.warn("Could not open source in the assembler language service:", error);
        });

        return () => {
            publish();
            changes.dispose();
            void languageClient.closeDocument(documentUri);
            monacoInstance.editor.setModelMarkers(model, markerOwner, []);
        };
    }, [documentUri, editorInstance, language, languageClient, monacoInstance]);

    useEffect(() => {
        if (!editorInstance || !monacoInstance || !executingLine || language !== "sicxe")
            return;

        const model = editorInstance.getModel();
        if (!model || model.isDisposed() || executingLine > model.getLineCount())
            return;

        const decorations = editorInstance.createDecorationsCollection();
        decorations.set([{
            range: new monacoInstance.Range(executingLine, 1, executingLine, 1),
            options: {
                isWholeLine: true,
                className: "sicxe-executing-line",
                glyphMarginClassName: "sicxe-executing-glyph",
                glyphMarginHoverMessage: {
                    value: "Currently executing address " + (executingAddress ?? "unknown") + " (line " + executingLine + ")",
                },
                overviewRuler: {
                    color: "#f87171",
                    position: monacoInstance.editor.OverviewRulerLane.Left,
                },
            },
        }]);

        // Keep the user's caret and selection intact; only scroll when the
        // executing statement is outside the current viewport.
        editorInstance.revealLineInCenterIfOutsideViewport(executingLine);
        return () => decorations.clear();
    }, [editorInstance, monacoInstance, executingAddress, executingLine, language]);

    useEffect(() => {
        if (!editorInstance || bands.length === 0) return;
        const decorations = editorInstance.createDecorationsCollection(bandDecorations(bands));
        return () => decorations.clear();
    }, [bands, editorInstance]);

    useEffect(() => {
        if (!editorInstance || !secondaryLine) return;
        const model = editorInstance.getModel();
        if (!model || model.isDisposed() || secondaryLine > model.getLineCount()) return;

        const decorations = editorInstance.createDecorationsCollection([secondaryLineDecoration(secondaryLine)]);
        editorInstance.revealLineInCenterIfOutsideViewport(secondaryLine);
        return () => decorations.clear();
    }, [editorInstance, secondaryLine]);

    // By value: the page computes a new range object on every render.
    const selectedFrom = selectedLines?.from ?? null;
    const selectedTo = selectedLines?.to ?? null;
    useEffect(() => {
        if (!editorInstance || selectedFrom === null || selectedTo === null) return;
        const model = editorInstance.getModel();
        if (!model || model.isDisposed() || selectedFrom > model.getLineCount()) return;

        const decorations = editorInstance.createDecorationsCollection([
            selectedExpansionDecoration({ from: selectedFrom, to: selectedTo }),
        ]);
        return () => decorations.clear();
    }, [editorInstance, selectedFrom, selectedTo]);

    useEffect(() => {
        if (!editorInstance || !onBandClick || bands.length === 0) return;
        const listener = editorInstance.onMouseDown((event) => {
            const line = event.target.position?.lineNumber;
            if (!event.event.leftButton || line === undefined) return;
            const index = bandAt(bands, line);
            if (index >= 0) onBandClick(index);
        });
        return () => listener.dispose();
    }, [bands, editorInstance, onBandClick]);
    return (
        <section
            className="
                h-full
                flex
                flex-col
                bg-zinc-950
            "
        >
            {/* Tab bar */}

            <div
                className="
                    h-10
                    shrink-0
                    flex
                    items-center
                    bg-zinc-900
                    border-b
                    border-zinc-800
                "
            >
                <div
                    className="
                        h-full
                        px-4
                        flex
                        items-center
                        gap-2
                        border-r
                        border-zinc-800
                        bg-zinc-950
                        text-sm
                    "
                >
                    <File size={14} />

                    <span>{path}</span>

                    {readOnly && (
                        <span className="rounded bg-amber-950/60 px-1.5 text-[10px] uppercase tracking-wide text-amber-300">
                            generated
                        </span>
                    )}

                    {onCloseTab && (
                        <X
                            size={14}
                            className="
                                ml-3
                                text-zinc-500
                                hover:text-zinc-200
                                cursor-pointer
                            "
                            onClick={onCloseTab}
                        />
                    )}
                </div>

                {headerActions && (
                    <div className="ml-auto flex items-center gap-1 px-2">
                        {headerActions}
                    </div>
                )}
            </div>

            {/* Monaco */}

            <div className="flex-1 min-h-0">
                <Editor
                    height="100%"
                    path={documentUri ?? path}
                    language={language}
                    value={value}
                    theme={language === "sicxe" ? "sicxe-dark" : theme}
                    beforeMount={(monaco) => {
                        if (language === "sicxe") registerSicxeLanguage(monaco);
                    }}
                    onMount={(editor, monaco) => {
                        if (language === "sicxe") {
                            const model = editor.getModel();
                            if (model && model.getLanguageId() !== "sicxe")
                                monaco.editor.setModelLanguage(model, "sicxe");
                        }
                        setEditorInstance(editor);
                        setMonacoInstance(monaco);
                        onMount?.(editor, monaco);
                    }}
                    onChange={(next) => onChange(next ?? "")}
                    options={{
                        fontSize: 14,
                        fontFamily:
                            "JetBrains Mono, Cascadia Code, Consolas, monospace",
                        minimap: { enabled: false },
                        automaticLayout: true,
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        padding: { top: 12 },
                        renderWhitespace: "selection",
                        tabSize: 8,
                        insertSpaces: false,
                        lineNumbers: "on",
                        glyphMargin: true,
                        folding: true,
                        bracketPairColorization: { enabled: true },
                        quickSuggestions: { other: true, comments: false, strings: false },
                        suggestOnTriggerCharacters: true,
                        readOnly,
                        domReadOnly: readOnly,
                    }}
                />
            </div>
        </section>
    );
}

export default CodeEditor;
