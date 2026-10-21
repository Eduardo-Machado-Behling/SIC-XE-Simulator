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
import { SyncStatusNotice } from "@/components/SyncStatusNotice";

import { Simulator } from "@/lib/simulator/Simulator";
import { SimulatorCommandError } from "@/lib/transport/SimulatorTransport";
import { Project } from "@/lib/simulator/Project";
import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import { RegisterState } from "./RegisterTable";
import { symbolsFromEvents, type AssemblySymbol, type ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import { filePathProblem } from "@/lib/api/contract";
import { describeApiError } from "@/lib/api/errors";
import { getProjectSync } from "@/lib/projects/projectSyncInstance";
import type { ProjectSync, SyncStatus } from "@/lib/projects/ProjectSync";

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

/** What the page needs from the simulator (Simulator.get() by default). */
export type EditorSimulator = Pick<Simulator, "bindProject" | "runFile" | "step" | "reset" | "clear" | "resolve">;

interface PageProps {
    projectId: string
    /** Defaults to the page-wide instances; tests pass their own. */
    sync?: ProjectSync
    simulator?: EditorSimulator
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

export default function EditorPage({ projectId, sync: syncProp, simulator: simulatorProp }: PageProps) {
    // Created on first use in an effect or handler, never during render: the
    // server render must not open a /ws connection of its own.
    const getSimulator = useCallback((): EditorSimulator => simulatorProp ?? Simulator.get(), [simulatorProp]);
    const getSync = useCallback(() => syncProp ?? getProjectSync(), [syncProp]);

    const [memory, setMemory] = useState<Map<number, number>>(new Map());
    const [registers, setRegisters] = useState<RegisterState[]>([]);
    const [project, setProject] = useState<Project | null>(null);
    const [arch, setArch] = useState<ArchitectureInfo | null>(null);
    const [files, setFiles] = useState<Record<string, string>>({});
    const [activeFile, setActiveFile] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: "idle" });
    const [archError, setArchError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
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

    const consoleHandleRef = useRef<ConsoleHandle | null>(null);

    const applyExecutionEvents = useCallback((events: ExecutionEvent[], animateInstruction = true) => {
        getSimulator().resolve(events, setMemory, setRegisters);
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
    }, [getSimulator]);

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
    // Load the project on mount (and whenever projectId changes).
    // Project data comes from this browser's store, the source of truth,
    // which ProjectSync mirrors to the server session over HTTP. The
    // detailed ArchitectureInfo comes from binding the simulator to the
    // project over /ws (temporary legacy staging: LegacyExecutionBridge.ts),
    // since the HTTP contract only lists architecture identifiers.
    // --------------------------------------------------------

    useEffect(() => {
        let cancelled = false;
        const sync = getSync();
        const stopStatus = sync.subscribe(setSyncStatus);

        async function loadProject() {
            const local = sync.getProject(projectId);
            if (cancelled) return;

            // Nothing of a previously shown project's binding applies to this one.
            setArch(null);
            setArchError(null);

            if (!local) {
                setError("This project is not stored in this browser.");
                setLoading(false);
                return;
            }

            setProject(local);
            setFiles(local.files);
            setMemory(new Map());
            setPc(0);
            setSymbols(null);
            setActiveFile(Object.keys(local.files).sort()[0] ?? "");
            setLoading(false);

            void sync.start();

            try {
                const info = await getSimulator().bindProject(local);
                if (cancelled) return;

                setArch(info);
                setArchError(null);
                setRegisters(info.registers.map((reg) => ({
                    id: reg.id,
                    name: reg.name,
                    value: 0,
                })));
            } catch (err) {
                if (!cancelled) {
                    setArchError(`Architecture info unavailable: ${errorMessage(err)}`);
                }
            }
        }

        loadProject();

        return () => {
            cancelled = true;
            stopStatus();
        };
    }, [getSync, projectId, getSimulator]);

    // --------------------------------------------------------
    // File tree (derived from files)
    // --------------------------------------------------------

    const fileTree = useMemo(() => buildFileTree(files), [files]);

    // --------------------------------------------------------
    // Active file
    // --------------------------------------------------------

    const activeContent = Object.hasOwn(files, activeFile) ? files[activeFile] : "";

    const updateFile = useCallback(
        (content: string) => {
            if (!activeFile) return;
            setFiles((current) => ({
                ...current,
                [activeFile]: content,
            }));
            // Saved in this browser at once; mirrored to the server shortly after.
            getSync()
                .saveFile(projectId, activeFile, content)
                .then((outcome) => {
                    if (outcome.ok) setNotice(null);
                })
                .catch((err: unknown) => setNotice(describeApiError(err).message));
        },
        [activeFile, getSync, projectId],
    );

    const createFile = useCallback(
        (path: string) => {
            if (Object.hasOwn(files, path)) {
                setActiveFile(path);
                return;
            }
            const problem = filePathProblem(path);
            if (problem) {
                setNotice(`Invalid file path "${path}": ${problem}.`);
                return;
            }
            setNotice(null);
            setFiles((current) => ({ ...current, [path]: "" }));
            setActiveFile(path);
            getSync()
                .saveFile(projectId, path, "")
                .catch((err: unknown) => setNotice(describeApiError(err).message));
        },
        [files, getSync, projectId],
    );

    const deleteFile = useCallback(
        (path: string) => {
            if (!window.confirm(`Delete ${path}?`)) return;
            const remaining = Object.keys(files).filter((candidate) => candidate !== path).sort();
            setFiles((current) => {
                const next = { ...current };
                delete next[path];
                return next;
            });
            if (activeFile === path) setActiveFile(remaining[0] ?? "");
            getSync()
                .deleteFile(projectId, path)
                .catch((err: unknown) => setNotice(describeApiError(err).message));
        },
        [activeFile, files, getSync, projectId],
    );

    const selectFile = useCallback(
        (path: string) => {
            if (!Object.hasOwn(files, path)) return;
            setActiveFile(path);
        },
        [files],
    );

    // --------------------------------------------------------
    // Simulator actions
    // --------------------------------------------------------

    // Run, Step, Reset and Clear need a simulator bound to this project: without
    // one, the shared server would act on whatever project it bound last.
    const executionBlocked = archError
        ? `The simulator cannot run this project. ${archError.replace(/\.?$/, ".")} Reload the page to try again.`
        : arch
            ? null
            : "The simulator is still loading this project.";

    const refuseExecution = useCallback((): boolean => {
        if (!executionBlocked) return false;
        consoleHandleRef.current?.write(`${executionBlocked}\r\n`);
        return true;
    }, [executionBlocked]);

    const reportFailure = useCallback((action: string, err: unknown) => {
        consoleHandleRef.current?.write(`${action} failed: ${errorMessage(err)}\r\n`);
        reportCommandError(err);
    }, [reportCommandError]);

    const run = useCallback(async () => {
        if (refuseExecution()) return;
        consoleHandleRef.current?.write("Running program...\r\n");

        try {
            // The browser's copy is the source of truth; the simulator gets it staged right before the run.
            const current = getSync().getProject(projectId);
            if (!current) throw new Error("This project is no longer stored in this browser.");

            const steps = await getSimulator().runFile(current, activeFile);

            setSymbols(symbolsFromEvents(steps));
            applyExecutionEvents(steps);

            setIsRunning(true);
            consoleHandleRef.current?.write("Program finished.\r\n");
        } catch (err) {
            setIsRunning(false);
            // The previous program's symbols no longer describe the source.
            setSymbols(null);
            reportFailure("Run", err);
        }
    }, [activeFile, applyExecutionEvents, getSync, projectId, refuseExecution, reportFailure, getSimulator]);

    const stop = useCallback(() => {
        setIsRunning(false);
    }, []);

    const step = useCallback(async () => {
        if (refuseExecution()) return;
        consoleHandleRef.current?.write("Executing one instruction...\r\n");
        try {
            const steps = await getSimulator().step();
            applyExecutionEvents(steps);
            consoleHandleRef.current?.write(JSON.stringify(steps));
        } catch (err) {
            reportFailure("Step", err);
        }
    }, [applyExecutionEvents, refuseExecution, reportFailure, getSimulator]);

    const reset = useCallback(async () => {
        if (refuseExecution()) return;
        setIsRunning(false);
        if (instructionTimerRef.current) clearTimeout(instructionTimerRef.current);
        setConsumedMemory([]);
        consoleHandleRef.current?.clear();
        try {
            const steps = await getSimulator().reset();
            applyExecutionEvents(steps, false);
        } catch (err) {
            reportFailure("Reset", err);
        }
    }, [applyExecutionEvents, refuseExecution, reportFailure, getSimulator]);

    const clearMachine = useCallback(async () => {
        if (refuseExecution()) return;
        setIsRunning(false);
        if (instructionTimerRef.current) clearTimeout(instructionTimerRef.current);
        setConsumedMemory([]);
        try {
            const events = await getSimulator().clear();
            applyExecutionEvents(events, false);
            setSymbols(null);
        } catch (err) {
            reportFailure("Clear", err);
        }
    }, [applyExecutionEvents, refuseExecution, reportFailure, getSimulator]);

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
                executionDisabledReason={executionBlocked}
                onRun={run}
                onStop={stop}
                onStep={step}
                onReset={reset}
                onClear={clearMachine}
                onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            />

            <SyncStatusNotice
                status={syncStatus}
                extra={[archError, notice].filter(Boolean).join(" ") || null}
            />

            <div className="flex-1 min-h-0">
                <Group orientation="horizontal" className="h-full">
                    <Panel defaultSize="18%" minSize="12%" maxSize="35%">
                        <FileExplorer
                            tree={fileTree}
                            activeFile={activeFile}
                            onSelectFile={selectFile}
                            onCreateFile={createFile}
                            onDeleteFile={deleteFile}
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
