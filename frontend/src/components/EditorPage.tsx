"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Play, RotateCcw, Square, StepForward } from "lucide-react";

import { FileExplorer, type FileNode } from "@/components/FileExplorer";
import { CodeEditor } from "@/components/CodeEditor";
import { Console, type ConsoleHandle } from "@/components/Console";
import { CommandPalette } from "@/components/CommandPalette";
import { TopBar } from "@/components/TopBar";
import { StatusBar } from "@/components/StatusBar";
import { ExecutionView } from "@/components/ExecutionView";

import { Simulator } from "@/lib/simulator/Simulator";
import { Project } from "@/lib/simulator/Project";
import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import { RegisterState } from "./RegisterTable";

// ============================================================
// Helpers
// ============================================================

function getLanguage(path: string): string {
    if (path.endsWith(".asm")) return "sicxe";
    if (path.endsWith(".md")) return "markdown";
    if (path.endsWith(".json")) return "json";
    return "plaintext";
}

/**
 * Turns a flat map of path -> content (as returned by the backend) into the
 * nested FileNode[] shape FileExplorer needs, splitting each path on "/".
 */
function buildFileTree(files: Record<string, string>): FileNode[] {
    const root: FileNode[] = [];
    const foldersById = new Map<string, FileNode[]>([["", root]]);

    const getChildren = (folderPath: string): FileNode[] => {
        const existing = foldersById.get(folderPath);
        if (existing) return existing;

        const segments = folderPath.split("/");
        const name = segments[segments.length - 1];
        const parentPath = segments.slice(0, -1).join("/");

        const node: FileNode = { id: folderPath, name, children: [] };
        getChildren(parentPath).push(node);
        foldersById.set(folderPath, node.children!);

        return node.children!;
    };

    for (const path of Object.keys(files).sort()) {
        const segments = path.split("/");
        const fileName = segments[segments.length - 1];
        const folderPath = segments.slice(0, -1).join("/");

        getChildren(folderPath).push({ id: path, name: fileName });
    }

    return root;
}

// ============================================================
// Page
// ============================================================

interface PageProps {
    projectId: string
}

export default function EditorPage({ projectId }: PageProps) {
    const simulator = Simulator.get();

    const [memory, setMemory] = useState<Map<number, number>>(new Map());
    const [registers, setRegisters] = useState<RegisterState[]>([]);
    const [project, setProject] = useState<Project | null>(null);
    const [arch, setArch] = useState<ArchitectureInfo | null>(null);
    const [files, setFiles] = useState<Record<string, string>>({});
    const [activeFile, setActiveFile] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pc, setPc] = useState<number>(0)

    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);

    const consoleHandleRef = useRef<ConsoleHandle | null>(null);

    // --------------------------------------------------------
    // Fetch the project on mount (and whenever projectId changes)
    // --------------------------------------------------------

    useEffect(() => {
        let cancelled = false;

        async function loadProject() {
            try {
                const data =
                    await simulator.loadProject(projectId);

                if (cancelled) {
                    return;
                }

                setProject(data.project);
                setFiles(data.project.files);

                const firstPath =
                    Object.keys(data.project.files).sort()[0] ?? "";
                setArch(data.arch)

                setRegisters(data.arch.registers.map((reg) => {
                    return {
                        id: reg.id,
                        name: reg.name,
                        value: 0
                    }
                }))

                setActiveFile(firstPath);
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load project",
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadProject();

        return () => {
            cancelled = true;
        };
    }, [projectId]);

    // --------------------------------------------------------
    // File tree (derived from files)
    // --------------------------------------------------------

    const fileTree = useMemo(() => buildFileTree(files), [files]);

    // --------------------------------------------------------
    // Active file
    // --------------------------------------------------------

    const activeContent = files[activeFile] ?? "";

    const updateFile = useCallback(
        (content: string) => {
            setFiles((current) => ({
                ...current,
                [activeFile]: content,
            }));
        },
        [activeFile],
    );

    const selectFile = useCallback(
        (path: string) => {
            if (!(path in files)) return;
            setActiveFile(path);
        },
        [files],
    );

    // --------------------------------------------------------
    // Simulator actions
    // --------------------------------------------------------

    const run = useCallback(() => {
        consoleHandleRef.current?.write(
            "Running program...\r\nProgram finished.\r\n",
        );

        simulator.setFile(activeFile, activeContent).then(
            () => {
                simulator.loadFile(activeFile).then(
                    () =>  setIsRunning(true)
                )
            }
        )

    }, [activeFile, activeContent]);

    const stop = useCallback(() => {
        setIsRunning(false);
    }, []);

    const step = useCallback(() => {
        consoleHandleRef.current?.write("Executing one instruction...\r\n");
        simulator.step().then((steps) => {
            simulator.resolve(steps, setMemory, setRegisters)
            consoleHandleRef.current?.write(JSON.stringify(steps));
        })

    }, []);

    const reset = useCallback(() => {
        setIsRunning(false);
        consoleHandleRef.current?.clear();
        simulator.reset().then((steps) => {
            simulator.resolve(steps, setMemory, setRegisters)
        })
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

    // --------------------------------------------------------
    // Loading / error states
    // --------------------------------------------------------

    if (loading) {
        return (
            <div
                className="
                    h-screen
                    w-screen
                    bg-zinc-950
                    text-zinc-400
                    flex
                    items-center
                    justify-center
                    text-sm
                "
            >
                Loading project…
            </div>
        );
    }

    if (error || !project) {
        return (
            <div
                className="
                    h-screen
                    w-screen
                    bg-zinc-950
                    text-red-400
                    flex
                    items-center
                    justify-center
                    text-sm
                "
            >
                {error ?? "Project not found."}
            </div>
        );
    }

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
                title={project.name}
                isRunning={isRunning}
                onRun={run}
                onStop={stop}
                onStep={step}
                onReset={reset}
                onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            />

            <div className="flex-1 min-h-0">
                <Group orientation="horizontal" className="h-full">
                    <Panel defaultSize="18%" minSize="12%" maxSize="35%">
                        <FileExplorer
                            tree={fileTree}
                            activeFile={activeFile}
                            onSelectFile={selectFile}
                        />
                    </Panel>

                    <Separator
                        className="
                            w-1
                            bg-zinc-900
                            hover:bg-blue-500
                            transition-colors
                        "
                    />

                    <Panel>
                        <Group orientation="vertical" className="h-full">
                            <Panel defaultSize="75%" minSize="30%">
                                <CodeEditor
                                    path={activeFile}
                                    value={activeContent}
                                    language={getLanguage(activeFile)}
                                    onChange={updateFile}
                                />
                            </Panel>

                            <Separator
                                className="
                                    h-1
                                    bg-zinc-900
                                    hover:bg-blue-500
                                    transition-colors
                                "
                            />

                            <Panel defaultSize="25%" minSize="10%" maxSize="60%">
                                <Console
                                    onCommand={handleConsoleCommand}
                                    handleRef={consoleHandleRef}
                                />
                            </Panel>
                        </Group>
                    </Panel>

                    <Panel defaultSize="30%" minSize="10%" maxSize="60%">
                        <Separator
                            className="
                                    h-1
                                    bg-zinc-900
                                    hover:bg-blue-500
                                    transition-colors
                                "
                        />
                        <ExecutionView arch={arch} memory={memory} registers={registers} memorySize={arch?.memory.address_space_size} pc={pc} />
                    </Panel>
                </Group>
            </div>

            <StatusBar
                left={project.name}
                activeFile={activeFile}
                language={project.architecture}
            />

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