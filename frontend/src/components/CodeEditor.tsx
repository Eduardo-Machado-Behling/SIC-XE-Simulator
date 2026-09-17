"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { File, X } from "lucide-react";

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
    onChange,
    onCloseTab,
    onMount,
    theme = "vs-dark",
}: CodeEditorProps) {
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
                    language={language}
                    value={value}
                    theme={theme}
                    onMount={onMount}
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
                    }}
                />
            </div>
        </section>
    );
}

export default CodeEditor;
