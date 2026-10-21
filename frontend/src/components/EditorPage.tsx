"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Eraser, Play, RotateCcw, Square, StepForward } from "lucide-react";

import { FileExplorer, type FileNode } from "@/components/FileExplorer";
import { CodeEditor } from "@/components/CodeEditor";
import { Console, type ConsoleHandle } from "@/components/Console";
import { CommandPalette } from "@/components/CommandPalette";
import { TopBar } from "@/components/TopBar";
import { StatusBar } from "@/components/StatusBar";
import { ExecutionView } from "@/components/ExecutionView";
import { ErrorModal } from "@/components/ErrorModal";

import { Simulator } from "@/lib/simulator/Simulator";
import { SimulatorCommandError } from "@/lib/transport/SimulatorTransport";
import { AssemblerLanguageClient } from "@/lib/language/LanguageClient";
import { setAssemblerLanguageClient } from "@/lib/language/sicxeLanguage";
import { simulatorWebSocketUrl } from "@/lib/transport/urls";
import { Project } from "@/lib/simulator/Project";
import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import { RegisterState } from "./RegisterTable";
import { symbolsFromEvents, type AssemblySymbol, type ExecutionEvent } from "@/lib/simulator/ExecutionEvent";

// ============================================================
// Helpers
// ============================================================

function getLanguage(path: string, architecture?: string): string {
    const extensionPath = path.toLowerCase();
    if (extensionPath.endsWith(".md")) return "markdown";
    if (extensionPath.endsWith(".json")) return "json";
    if ([".asm", ".sic", ".sicxe", ".sxe", ".s"].some((extension) => extensionPath.endsWith(extension)))
        return "sicxe";

    // Projects identify their source language independently of the filename.
    // Use that metadata for source files with a custom or missing extension.
    const architectureId = architecture?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (architectureId === "sicxe") return "sicxe";

    return "plaintext";
}

function languageDocumentUri(projectId: string, path: string): string {
    const segments = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
    return `sicxe://project/${encodeURIComponent(projectId)}/${segments}`;
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
    const [changedRegisters, setChangedRegisters] = useState<string[]>([]);
    const [changedMemory, setChangedMemory] = useState<number[]>([]);
    const [consumedMemory, setConsumedMemory] = useState<number[]>([]);
    const [changeRevision, setChangeRevision] = useState(0);
    const [symbols, setSymbols] = useState<AssemblySymbol[] | null>(null);
    const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const instructionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [actionError, setActionError] = useState<{ title: string; detail: string } | null>(null);
    const [languageClient, setLanguageClient] = useState<AssemblerLanguageClient | null>(null);

    const consoleHandleRef = useRef<ConsoleHandle | null>(null);

    useEffect(() => {
        const client = new AssemblerLanguageClient(simulatorWebSocketUrl("/language"));
        setAssemblerLanguageClient(client);
        setLanguageClient(client);
        return () => {
            setAssemblerLanguageClient(null);
            client.dispose();
        };
    }, [projectId]);

    const applyExecutionEvents = useCallback((events: ExecutionEvent[], animateInstruction = true) => {
        simulator.resolve(events, setMemory, setRegisters);
        if (events.some((event) => event.type === "ProgramAssembled" || event.type === "ProgramCleared")) {
            setSymbols(symbolsFromEvents(events));
        }
        setChangedRegisters([...new Set(events
            .filter((event) => event.type === "RegisterWrite")
            .map((event) => event.name))]);
        setChangedMemory([...new Set(events.flatMap((event) =>
            event.type === "MemoryWrite"
                ? event.bytes.map((_, index) => event.address + index)
                : [],
        ))]);

        if (instructionTimerRef.current) clearTimeout(instructionTimerRef.current);
        setConsumedMemory([]);

        const pcWrite = events.findLast((event) =>
            event.type === "RegisterWrite" && event.name === "PC",
        );

        if (animateInstruction) {
            const fetched = events.findLast((event) => event.type === "InstructionFetched");
            if (fetched?.type === "InstructionFetched") {
                const decoded = events.findLast((event) =>
                    event.type === "InstructionDecoded" && event.details.address === fetched.address,
                );
                const consumedLength = decoded?.type === "InstructionDecoded"
                    ? decoded.details.length
                    : fetched.bytes.length;
                const consumed = Array.from({ length: consumedLength }, (_, index) => fetched.address + index);
                const nextPc = pcWrite?.type === "RegisterWrite"
                    ? pcWrite.value
                    : fetched.address + consumedLength;

                setPc(fetched.address);
                setConsumedMemory(consumed);
                instructionTimerRef.current = setTimeout(() => {
                    setPc(nextPc);
                    setConsumedMemory([]);
                    instructionTimerRef.current = null;
                }, 720);
            } else if (pcWrite?.type === "RegisterWrite") {
                // Loading/assembling a file can set the entry PC without fetching an instruction.
                setPc(pcWrite.value);
            }
        } else {
            setPc(pcWrite?.type === "RegisterWrite" ? pcWrite.value : 0);
        }

        setChangeRevision((revision) => revision + 1);
        if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
        changeTimerRef.current = setTimeout(() => {
            setChangedRegisters([]);
            setChangedMemory([]);
        }, 720);
    }, [simulator]);

    const reportCommandError = useCallback((reason: unknown) => {
        if (reason instanceof SimulatorCommandError) {
            if (reason.events?.length) applyExecutionEvents(reason.events, false);
            setActionError({
                title: reason.problem.title,
                detail: reason.problem.detail || reason.message,
            });
            return;
        }
        setActionError({
            title: "Simulator request failed",
            detail: reason instanceof Error ? reason.message : "The simulator could not complete the request.",
        });
    }, [applyExecutionEvents]);

    useEffect(() => () => {
        if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
        if (instructionTimerRef.current) clearTimeout(instructionTimerRef.current);
    }, []);

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
                setMemory(new Map());
                setPc(0);
                setSymbols(null);

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
    }, [projectId, simulator]);

    // --------------------------------------------------------
    // File tree (derived from files)
    // --------------------------------------------------------

    const fileTree = useMemo(() => buildFileTree(files), [files]);

    // --------------------------------------------------------
    // Active file
    // --------------------------------------------------------

    const activeContent = files[activeFile] ?? "";
    const activeLanguage = getLanguage(activeFile, project?.architecture);
    const activeDocumentUri = project && activeFile
        ? languageDocumentUri(project.id, activeFile)
        : undefined;

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

    const run = useCallback(async () => {
        consoleHandleRef.current?.write(
            "Running program...\r\nProgram finished.\r\n",
        );

        try {
            await simulator.setFile(activeFile, activeContent);
            if (languageClient && activeDocumentUri) {
                try {
                    await languageClient.saveDocument(activeDocumentUri, activeContent);
                } catch (languageError) {
                    console.warn("Assembler language service save sync failed:", languageError);
                }
            }

            const steps = await simulator.loadFile(activeFile);

            console.log("Solve:", steps);

            setSymbols(symbolsFromEvents(steps));
            applyExecutionEvents(steps);

            setIsRunning(true);
        } catch (error) {
            setIsRunning(false);
            reportCommandError(error);
            console.error("Run failed:", error);
        }
    }, [activeDocumentUri, activeFile, activeContent, applyExecutionEvents, languageClient, reportCommandError, simulator]);

    const stop = useCallback(() => {
        setIsRunning(false);
    }, []);

    const step = useCallback(async () => {
        consoleHandleRef.current?.write("Executing one instruction...\r\n");
        try {
            const steps = await simulator.step();
            applyExecutionEvents(steps);
            consoleHandleRef.current?.write(JSON.stringify(steps));
        } catch (error) {
            reportCommandError(error);
        }
    }, [applyExecutionEvents, reportCommandError, simulator]);

    const reset = useCallback(async () => {
        setIsRunning(false);
        if (instructionTimerRef.current) clearTimeout(instructionTimerRef.current);
        setConsumedMemory([]);
        consoleHandleRef.current?.clear();
        try {
            const steps = await simulator.reset();
            applyExecutionEvents(steps, false);
        } catch (error) {
            reportCommandError(error);
        }
    }, [applyExecutionEvents, reportCommandError, simulator]);

    const clearMachine = useCallback(async () => {
        setIsRunning(false);
        if (instructionTimerRef.current) clearTimeout(instructionTimerRef.current);
        setConsumedMemory([]);
        try {
            const events = await simulator.clear();
            applyExecutionEvents(events, false);
            setSymbols(null);
        } catch (error) {
            reportCommandError(error);
        }
    }, [applyExecutionEvents, reportCommandError, simulator]);

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
                        "  clear machine  Clear memory and registers\r\n" +
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

                case "clear machine":
                    clearMachine();
                    break;

                default:
                    handle.write(`Unknown command: ${command}\r\n`);
                    break;
            }
        },
        [run, step, reset, clearMachine],
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
            <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 px-6 text-sm text-zinc-400">
                <div className="text-center">
                    <p>{error ?? "Project not found."}</p>
                    <a href="/" className="mt-3 inline-block text-blue-300 hover:text-blue-200">Back to projects</a>
                </div>
                {error && <ErrorModal title="Could not open project" detail={error} onClose={() => setError(null)} />}
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
                onClear={clearMachine}
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
                                    key={activeDocumentUri ?? activeFile}
                                    path={activeFile}
                                    value={activeContent}
                                    language={activeLanguage}
                                    documentUri={activeLanguage === "sicxe" ? activeDocumentUri : undefined}
                                    languageClient={activeLanguage === "sicxe" ? languageClient : null}
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
                        <ExecutionView arch={arch} memory={memory} registers={registers} memorySize={arch?.memory.address_space_size} pc={pc} changedMemory={changedMemory} changedRegisters={changedRegisters} changeRevision={changeRevision} consumedMemory={consumedMemory} symbols={symbols} />
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
                    {
                        id: "clear",
                        label: "Clear Memory and Registers",
                        icon: Eraser,
                        onSelect: clearMachine,
                    },
                    { id: "stop", label: "Stop Program", icon: Square, onSelect: stop },
                ]}
            />
            {actionError && <ErrorModal title={actionError.title} detail={actionError.detail} onClose={() => setActionError(null)} />}
        </div>
    );
}
