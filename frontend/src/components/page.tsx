"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    PanelGroup,
    Panel,
    PanelResizeHandle,
} from "react-resizable-panels";
import { Play, RotateCcw, Square, StepForward } from "lucide-react";

import { FileExplorer, type FileNode } from "./components/FileExplorer";
import { CodeEditor } from "./components/CodeEditor";
import { Console, type ConsoleHandle } from "./components/Console";
import { CommandPalette } from "./components/CommandPalette";
import { TopBar } from "./components/TopBar";
import { StatusBar } from "./components/StatusBar";

// ============================================================
// Types
// ============================================================

type ProjectFile = {
    path: string;
    content: string;
};

// ============================================================
// Initial project
// ============================================================

const INITIAL_FILES: ProjectFile[] = [
    {
        path: "src/main.asm",
        content: `COPY    START   1000

FIRST   STL     RETADR
        LDB     #LENGTH
        BASE    LENGTH

LOOP    +JSUB   RDREC
        LDA     LENGTH
        COMP    #0
        JEQ     ENDFIL

        +JSUB   WRREC
        J       LOOP

ENDFIL  LDA     EOF
        STA     BUFFER

        LDL     RETADR
        RSUB

EOF     BYTE    C'EOF'
RETADR  RESW    1
LENGTH  RESW    1
BUFFER  RESB    4096

        END     FIRST
`,
    },
    {
        path: "src/data.asm",
        content: `LENGTH  WORD    4096
BUFFER  RESB    4096

EOF     BYTE    C'EOF'
`,
    },
    {
        path: "src/io.asm",
        content: `RDREC   CLEAR   X
        CLEAR   A
        CLEAR   S

        RSUB

WRREC   RSUB
`,
    },
    {
        path: "README.md",
        content: `# SIC-XE Project

This project contains a small SIC-XE program.

## Files

- src/main.asm
- src/data.asm
- src/io.asm
`,
    },
];

const FILE_TREE: FileNode[] = [
    {
        id: "src",
        name: "src",
        children: [
            { id: "src/main.asm", name: "main.asm" },
            { id: "src/data.asm", name: "data.asm" },
            { id: "src/io.asm", name: "io.asm" },
        ],
    },
    { id: "README.md", name: "README.md" },
];

// ============================================================
// Helpers
// ============================================================

function getLanguage(path: string): string {
    if (path.endsWith(".asm")) return "sicxe";
    if (path.endsWith(".md")) return "markdown";
    if (path.endsWith(".json")) return "json";
    return "plaintext";
}

// ============================================================
// Page
// ============================================================

export default function EditorPage() {
    const [files, setFiles] = useState<ProjectFile[]>(INITIAL_FILES);
    const [activeFile, setActiveFile] = useState("src/main.asm");
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);

    const consoleHandleRef = useRef<ConsoleHandle | null>(null);

    // --------------------------------------------------------
    // Active file
    // --------------------------------------------------------

    const activeContent = useMemo(() => {
        return files.find((file) => file.path === activeFile)?.content ?? "";
    }, [files, activeFile]);

    const updateFile = useCallback(
        (content: string) => {
            setFiles((current) =>
                current.map((file) =>
                    file.path === activeFile ? { ...file, content } : file,
                ),
            );
        },
        [activeFile],
    );

    const selectFile = useCallback(
        (path: string) => {
            const file = files.find((file) => file.path === path);
            if (!file) return;
            setActiveFile(file.path);
        },
        [files],
    );

    // --------------------------------------------------------
    // Simulator actions
    // --------------------------------------------------------

    const run = useCallback(() => {
        setIsRunning(true);
        consoleHandleRef.current?.write(
            "Running program...\r\nProgram finished.\r\n",
        );
    }, []);

    const stop = useCallback(() => {
        setIsRunning(false);
    }, []);

    const step = useCallback(() => {
        consoleHandleRef.current?.write("Executing one instruction...\r\n");
    }, []);

    const reset = useCallback(() => {
        setIsRunning(false);
        consoleHandleRef.current?.write("Simulator reset.\r\n");
    }, []);

    // --------------------------------------------------------
    // Console command handling
    // --------------------------------------------------------

    const handleConsoleCommand = useCallback(
        (command: string, handle: ConsoleHandle) => {
            switch (command) {
                case "help":
                    handle.write(
                        "Commands:\r\n" +
                            "  help     Show this message\r\n" +
                            "  run      Run the program\r\n" +
                            "  step     Execute one instruction\r\n" +
                            "  reset    Reset the simulator\r\n" +
                            "  clear    Clear the terminal\r\n",
                    );
                    break;

                case "clear":
                    handle.clear();
                    break;

                case "run":
                    run();
                    break;

                case "step":
                    step();
                    break;

                case "reset":
                    reset();
                    break;

                default:
                    handle.write(`Unknown command: ${command}\r\n`);
                    break;
            }
        },
        [run, step, reset],
    );

    // --------------------------------------------------------
    // Command palette shortcut
    // --------------------------------------------------------

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (
                event.ctrlKey &&
                event.shiftKey &&
                event.key.toLowerCase() === "p"
            ) {
                event.preventDefault();
                setCommandPaletteOpen((current) => !current);
            }

            if (event.key === "Escape") {
                setCommandPaletteOpen(false);
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    return (
        <div
            className="
                h-screen
                w-screen
                bg-zinc-950
                text-zinc-200
                flex
                flex-col
                overflow-hidden
            "
        >
            <TopBar
                title="SIC-XE Simulator"
                isRunning={isRunning}
                onRun={run}
                onStop={stop}
                onStep={step}
                onReset={reset}
                onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            />

            <div className="flex-1 min-h-0">
                <PanelGroup direction="horizontal" className="h-full">
                    <Panel defaultSize={18} minSize={12} maxSize={35}>
                        <FileExplorer
                            tree={FILE_TREE}
                            activeFile={activeFile}
                            onSelectFile={selectFile}
                        />
                    </Panel>

                    <PanelResizeHandle
                        className="
                            w-1
                            bg-zinc-900
                            hover:bg-blue-500
                            transition-colors
                        "
                    />

                    <Panel>
                        <PanelGroup direction="vertical" className="h-full">
                            <Panel defaultSize={75} minSize={30}>
                                <CodeEditor
                                    path={activeFile}
                                    value={activeContent}
                                    language={getLanguage(activeFile)}
                                    onChange={updateFile}
                                />
                            </Panel>

                            <PanelResizeHandle
                                className="
                                    h-1
                                    bg-zinc-900
                                    hover:bg-blue-500
                                    transition-colors
                                "
                            />

                            <Panel defaultSize={25} minSize={10} maxSize={60}>
                                <Console
                                    onCommand={handleConsoleCommand}
                                    handleRef={consoleHandleRef}
                                />
                            </Panel>
                        </PanelGroup>
                    </Panel>
                </PanelGroup>
            </div>

            <StatusBar left="SIC-XE" activeFile={activeFile} />

            <CommandPalette
                open={commandPaletteOpen}
                onOpenChange={setCommandPaletteOpen}
                heading="Simulator"
                actions={[
                    { id: "run", label: "Run Program", icon: Play, onSelect: run },
                    {
                        id: "step",
                        label: "Step CPU",
                        icon: StepForward,
                        onSelect: step,
                    },
                    {
                        id: "reset",
                        label: "Reset Simulator",
                        icon: RotateCcw,
                        onSelect: reset,
                    },
                    { id: "stop", label: "Stop Program", icon: Square, onSelect: stop },
                ]}
            />
        </div>
    );
}
