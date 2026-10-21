"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useState } from "react";
import type { editor } from "monaco-editor";
import { File, X } from "lucide-react";

import type {
    AssemblerLanguageClient,
} from "@/lib/language/LanguageClient";
import { toMonacoMarker } from "@/lib/language/monacoDiagnostics";
import { registerSicxeLanguage } from "@/lib/language/sicxeLanguage";

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
    /** Called with the new content on every edit. */
    onChange: (value: string) => void;
    /** Called when the user closes the tab. Omit to hide the close button. */
    onCloseTab?: () => void;
    /** Called once Monaco has mounted, useful for registering custom languages. */
    onMount?: OnMount;
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
    onCloseTab,
    onMount,
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
                        folding: true,
                        bracketPairColorization: { enabled: true },
                        quickSuggestions: { other: true, comments: false, strings: false },
                        suggestOnTriggerCharacters: true,
                    }}
                />
            </div>
        </section>
    );
}

export default CodeEditor;
