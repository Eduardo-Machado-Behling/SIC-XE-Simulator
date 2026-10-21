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
import { DEFAULT_MAIN_SOURCE } from "@/lib/simulator/defaultMainSource";
import {
    getStoredProject,
    saveStoredProject,
    syncProjectToSession,
} from "@/lib/simulator/ProjectSessionSync";
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
function buildFileTree(files: Record<string, string>, folders: string[] = []): FileNode[] {
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

    for (const path of [...folders].sort()) {
        if (path) getChildren(path);
    }

    for (const path of Object.keys(files).sort()) {
        const segments = path.split("/");
        const fileName = segments[segments.length - 1];
        const folderPath = segments.slice(0, -1).join("/");

        getChildren(folderPath).push({ id: path, name: fileName });
    }

    return root;
}

function parentFolders(paths: string[]): string[] {
    const folders = new Set<string>();
    for (const path of paths) {
        const parts = path.split("/").slice(0, -1);
        for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join("/"));
    }
    return [...folders];
}

function hasDirective(source: string, directive: "START" | "END"): boolean {
    return source.split(/\r?\n/).some((line) => {
        const code = line.replace(/;.*/, "").trim();
        if (!code || code.startsWith(".")) return false;
        const tokens = code.split(/\s+/);
        return tokens[0]?.toUpperCase() === directive || tokens[1]?.toUpperCase() === directive;
    });
}

function entryPointFile(files: Record<string, string>, architecture?: string): string {
    const paths = Object.keys(files).sort();
    const namedSources = paths.filter((path) => /\.(asm|sic|sicxe|sxe|s)$/i.test(path));
    const assemblySources = namedSources.length > 0
        ? namedSources
        : paths.filter((path) => hasDirective(files[path], "START") || hasDirective(files[path], "END"));
    const isSicxe = architecture?.toLowerCase().replace(/[^a-z0-9]/g, "") === "sicxe";
    const sources = assemblySources.length > 0 ? assemblySources : isSicxe ? [] : paths;
    return sources.find((path) => hasDirective(files[path], "START")) ??
        sources.find((path) => hasDirective(files[path], "END")) ??
        sources.find((path) => /(^|\/)main\.(asm|sic|sicxe|sxe|s)$/i.test(path)) ??
        sources[0] ?? (isSicxe ? "" : paths[0] ?? "");
}

function validSegment(name: string): boolean {
    return Boolean(name) && name !== "." && name !== ".." && !/[\\/:]/.test(name);
}

type SavedProjectState = { files: Record<string, string>; folders: string[] };

function projectStateKey(projectId: string): string {
    return `sicxe-project-state:${projectId}`;
}

function readProjectState(projectId: string): SavedProjectState | null {
    try {
        const raw = localStorage.getItem(projectStateKey(projectId));
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<SavedProjectState>;
        if (!value.files || typeof value.files !== "object" || Array.isArray(value.files)) return null;
        return {
            files: Object.fromEntries(Object.entries(value.files).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
            folders: Array.isArray(value.folders) ? value.folders.filter((path): path is string => typeof path === "string") : [],
        };
    } catch {
        return null;
    }
}

function writeProjectState(projectId: string, state: SavedProjectState): void {
    try {
        localStorage.setItem(projectStateKey(projectId), JSON.stringify(state));
    } catch (error) {
        console.warn("Could not save project changes in browser storage:", error);
    }
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
    const [folders, setFolders] = useState<string[]>([]);
    const [activeFile, setActiveFile] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pc, setPc] = useState<number>(0)
    const [executingLine, setExecutingLine] = useState<number | null>(null);
    const [executingAddress, setExecutingAddress] = useState<number | null>(null);
    const [executionSourceFile, setExecutionSourceFile] = useState<string | null>(null);
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

        const fetchedForSource = events.findLast((event) => event.type === "InstructionFetched");
        if (fetchedForSource?.type === "InstructionFetched") {
            setExecutingLine(fetchedForSource.source_line ?? null);
            setExecutingAddress(fetchedForSource.address);
        } else if (!animateInstruction || events.some((event) =>
            event.type === "ProgramAssembled" || event.type === "ProgramCleared"
        )) {
            setExecutingLine(null);
            setExecutingAddress(null);
        }

        const pcWrite = events.findLast((event) =>
            event.type === "RegisterWrite" && event.name === "PC",
        );

        if (animateInstruction) {
            const fetched = events.findLast((event) =>
                event.type === "InstructionFetched" && event.preview !== true,
            );
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
            consoleHandleRef.current?.log(reason.problem.detail || reason.message, "error");
            setActionError({
                title: reason.problem.title,
                detail: reason.problem.detail || reason.message,
            });
            return;
        }
        consoleHandleRef.current?.log(
            reason instanceof Error ? reason.message : "The simulator could not complete the request.",
            "error",
        );
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
                const storedProject = getStoredProject(projectId);
                if (!storedProject) {
                    throw new Error("This project is not available in browser storage.");
                }

                const savedState = readProjectState(projectId) ?? readProjectState(storedProject.id);
                const existingFiles = savedState?.files ?? storedProject.files;
                const projectFiles = Object.keys(existingFiles).length > 0
                    ? existingFiles
                    : { "main.asm": DEFAULT_MAIN_SOURCE };
                const projectFolders = [...new Set([
                    ...(savedState?.folders ?? []),
                    ...parentFolders(Object.keys(projectFiles)),
                ])];
                const projectToLoad = { ...storedProject, files: projectFiles };
                const sessionId = await syncProjectToSession(projectToLoad);
                const data = await simulator.loadProject(sessionId, storedProject.id);

                if (cancelled) {
                    return;
                }

                setProject(projectToLoad);
                setFiles(projectFiles);
                setFolders(projectFolders);
                setMemory(new Map());
                setPc(0);
                setSymbols(null);
                setExecutingLine(null);
                setExecutingAddress(null);
                setExecutionSourceFile(null);

                const firstPath = entryPointFile(projectFiles, data.project.architecture);
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

    const fileTree = useMemo(() => buildFileTree(files, folders), [files, folders]);

    // --------------------------------------------------------
    // Active file
    // --------------------------------------------------------

    const activeContent = files[activeFile] ?? "";
    const activeLanguage = getLanguage(activeFile, project?.architecture);
    const activeDocumentUri = project && activeFile
        ? languageDocumentUri(project.id, activeFile)
        : undefined;

    useEffect(() => {
        if (project && project.id === projectId && !loading) {
            writeProjectState(project.id, { files, folders });
            saveStoredProject({ ...project, files });
        }
    }, [files, folders, loading, project, projectId]);

    const updateFile = useCallback(
        (content: string) => {
            setExecutingLine(null);
            setExecutingAddress(null);
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

    const createFile = useCallback((folder: string) => {
        const name = window.prompt("New file name", "main.asm")?.trim();
        if (!name || !validSegment(name)) return;
        const path = [folder, name].filter(Boolean).join("/");
        if (path in files || folders.includes(path)) {
            setActionError({ title: "Name already exists", detail: `An item named “${name}” already exists here.` });
            return;
        }
        setFiles((current) => ({ ...current, [path]: "" }));
        setFolders((current) => [...new Set([...current, ...parentFolders([path])])]);
        setActiveFile(path);
    }, [files, folders]);

    const createFolder = useCallback((parent: string) => {
        const name = window.prompt("New folder name")?.trim();
        if (!name || !validSegment(name)) return;
        const path = [parent, name].filter(Boolean).join("/");
        if (path in files || folders.includes(path)) {
            setActionError({ title: "Name already exists", detail: `An item named “${name}” already exists here.` });
            return;
        }
        setFolders((current) => [...new Set([...current, ...parentFolders([`${path}/.folder`]), path])]);
    }, [files, folders]);

    const deletePaths = useCallback((paths: string[]) => {
        const removed = (candidate: string) => paths.some((path) =>
            candidate === path || candidate.startsWith(`${path}/`),
        );
        const nextFiles = Object.fromEntries(Object.entries(files).filter(([path]) => !removed(path)));
        const nextFolders = folders.filter((path) => !removed(path));
        setFiles(nextFiles);
        setFolders(nextFolders);
        if (removed(activeFile)) setActiveFile(entryPointFile(nextFiles, project?.architecture));
    }, [activeFile, files, folders, project?.architecture]);

    const renamePath = useCallback((path: string, name: string) => {
        if (!validSegment(name)) return;
        const isFolder = folders.includes(path) || Object.keys(files).some((file) => file.startsWith(`${path}/`));
        const destination = [...path.split("/").slice(0, -1), name].filter(Boolean).join("/");
        const sourcePaths = isFolder
            ? [...Object.keys(files).filter((file) => file.startsWith(`${path}/`)), ...folders.filter((folder) => folder === path || folder.startsWith(`${path}/`))]
            : [path];
        const remap = (candidate: string) => candidate === path ? destination : `${destination}${candidate.slice(path.length)}`;
        const moving = new Set(sourcePaths);
        const destinationPaths = sourcePaths.map(remap);
        if (destinationPaths.some((candidate) => (candidate in files && !moving.has(candidate)) || (folders.includes(candidate) && !moving.has(candidate)))) {
            setActionError({ title: "Name already exists", detail: "An item with that name already exists in this folder." });
            return;
        }
        const nextFiles = Object.fromEntries(Object.entries(files).map(([file, content]) => [
            isFolder && file.startsWith(`${path}/`) ? remap(file) : file === path ? destination : file,
            content,
        ]));
        const nextFolders = folders.map((folder) =>
            folder === path || folder.startsWith(`${path}/`) ? remap(folder) : folder,
        );
        setFiles(nextFiles);
        setFolders([...new Set([...nextFolders, ...parentFolders(Object.keys(nextFiles))])]);
        if (activeFile === path || activeFile.startsWith(`${path}/`)) setActiveFile(remap(activeFile));
    }, [activeFile, files, folders]);

    const movePaths = useCallback((paths: string[], targetFolder: string) => {
        const isFolder = (path: string) => folders.includes(path) || Object.keys(files).some((file) => file.startsWith(`${path}/`));
        const movingFiles = new Set<string>();
        const movingFolders = new Set<string>();
        const destinations = new Map<string, string>();

        for (const source of paths) {
            if (!source || (targetFolder && (targetFolder === source || targetFolder.startsWith(`${source}/`)))) return;
            const name = source.split("/").at(-1)!;
            const destination = [targetFolder, name].filter(Boolean).join("/");
            if (destination === source) continue;
            const folder = isFolder(source);
            const sourceFiles = folder ? Object.keys(files).filter((file) => file.startsWith(`${source}/`)) : [source];
            const sourceFolders = folder ? folders.filter((item) => item === source || item.startsWith(`${source}/`)) : [];
            for (const item of sourceFiles) {
                movingFiles.add(item);
                destinations.set(item, folder ? `${destination}${item.slice(source.length)}` : destination);
            }
            for (const item of sourceFolders) {
                movingFolders.add(item);
                destinations.set(item, item === source ? destination : `${destination}${item.slice(source.length)}`);
            }
            if (folder) movingFolders.add(source);
        }

        const destinationValues = [...destinations.values()];
        if (new Set(destinationValues).size !== destinationValues.length || destinationValues.some((destination) =>
            (destination in files && !movingFiles.has(destination)) ||
            (folders.includes(destination) && !movingFolders.has(destination)),
        )) {
            setActionError({ title: "Cannot move items", detail: "The destination already contains an item with the same name." });
            return;
        }

        const nextFiles = Object.fromEntries(Object.entries(files).map(([path, content]) => [destinations.get(path) ?? path, content]));
        const nextFolders = [...new Set([
            ...folders.map((path) => destinations.get(path) ?? path),
            ...parentFolders(Object.keys(nextFiles)),
            ...(targetFolder ? [targetFolder] : []),
        ])];
        setFiles(nextFiles);
        setFolders(nextFolders);
        const newActivePath = destinations.get(activeFile);
        if (newActivePath) setActiveFile(newActivePath);
    }, [activeFile, files, folders]);

    // --------------------------------------------------------
    // Simulator actions
    // --------------------------------------------------------

    const run = useCallback(async () => {
        try {
            const startFile = entryPointFile(files, project?.architecture);
            if (!startFile) {
                setActionError({ title: "No source file", detail: "Add an assembly source file before starting the simulator." });
                return;
            }
            consoleHandleRef.current?.log(`Assembling ${startFile}`, "info");
            setActiveFile(startFile);
            setExecutionSourceFile(startFile);
            setExecutingLine(null);
            setExecutingAddress(null);
            writeProjectState(project?.id ?? projectId, { files, folders });

            if (!project) throw new Error("No project is loaded.");
            const sessionId = await syncProjectToSession({ ...project, files });
            await simulator.loadProject(sessionId, project.id);

            const source = files[startFile] ?? "";
            const startDocumentUri = project
                ? languageDocumentUri(project.id, startFile)
                : undefined;
            if (languageClient && startDocumentUri) {
                try {
                    await languageClient.saveDocument(startDocumentUri, source);
                } catch (languageError) {
                    console.warn("Assembler language service save sync failed:", languageError);
                }
            }

            const steps = await simulator.loadFile(startFile);

            console.log("Solve:", steps);

            setSymbols(symbolsFromEvents(steps));
            applyExecutionEvents(steps);
            consoleHandleRef.current?.writeEvents(steps);
            consoleHandleRef.current?.log(`Loaded ${startFile}`, "success");

            setIsRunning(true);
        } catch (error) {
            setIsRunning(false);
            reportCommandError(error);
            console.error("Run failed:", error);
        }
    }, [applyExecutionEvents, files, folders, languageClient, project, projectId, reportCommandError, simulator]);

    const stop = useCallback(() => {
        setIsRunning(false);
    }, []);

    const step = useCallback(async () => {
        consoleHandleRef.current?.log("Stepping one instruction", "info");
        try {
            const steps = await simulator.step();
            applyExecutionEvents(steps);
            consoleHandleRef.current?.writeEvents(steps);
        } catch (error) {
            reportCommandError(error);
        }
    }, [applyExecutionEvents, reportCommandError, simulator]);

    const reset = useCallback(async () => {
        setIsRunning(false);
        if (instructionTimerRef.current) clearTimeout(instructionTimerRef.current);
        setConsumedMemory([]);
        consoleHandleRef.current?.log("Resetting registers and program counter", "warning");
        try {
            const steps = await simulator.reset();
            applyExecutionEvents(steps, false);
            consoleHandleRef.current?.writeEvents(steps);
        } catch (error) {
            reportCommandError(error);
        }
    }, [applyExecutionEvents, reportCommandError, simulator]);

    const clearMachine = useCallback(async () => {
        setIsRunning(false);
        if (instructionTimerRef.current) clearTimeout(instructionTimerRef.current);
        setConsumedMemory([]);
        consoleHandleRef.current?.log("Clearing machine state", "warning");
        try {
            const events = await simulator.clear();
            applyExecutionEvents(events, false);
            consoleHandleRef.current?.writeEvents(events);
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
                    handle.log("Available commands", "success");
                    handle.write(
                        "  \x1b[38;5;117mrun\x1b[0m            Assemble and load the entry file\r\n" +
                        "  \x1b[38;5;117mstep\x1b[0m           Execute one instruction\r\n" +
                        "  \x1b[38;5;117mreset\x1b[0m          Reset registers and PC\r\n" +
                        "  \x1b[38;5;117mclear machine\x1b[0m  Clear memory and registers\r\n" +
                        "  \x1b[38;5;117mclear\x1b[0m          Clear terminal output\r\n" +
                        "  \x1b[38;5;117mhelp\x1b[0m           Show this message\r\n",
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
                    handle.log(`Unknown command: ${command}. Type 'help' for commands.`, "error");
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
            const key = event.key.toLowerCase();
            const commandKey = event.ctrlKey || event.metaKey;

            if (event.key === "F2") {
                event.preventDefault();
                if (activeFile) {
                    const currentName = activeFile.split("/").at(-1) ?? activeFile;
                    const nextName = window.prompt("Rename file", currentName)?.trim();
                    if (nextName && nextName !== currentName) renamePath(activeFile, nextName);
                }
                return;
            }

            if (commandKey && event.shiftKey && key === "n") {
                event.preventDefault();
                const parent = activeFile.split("/").slice(0, -1).join("/");
                createFolder(parent);
                return;
            }

            if (commandKey && !event.shiftKey && key === "n") {
                event.preventDefault();
                const parent = activeFile.split("/").slice(0, -1).join("/");
                createFile(parent);
                return;
            }

            if (
                event.ctrlKey &&
                event.shiftKey &&
                key === "p"
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
    }, [activeFile, createFile, createFolder, renamePath]);

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
                            onCreateFile={createFile}
                            onCreateFolder={createFolder}
                            onDelete={deletePaths}
                            onRename={renamePath}
                            onMove={movePaths}
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
                                    executingLine={executionSourceFile === activeFile ? executingLine : null}
                                    executingAddress={executionSourceFile === activeFile ? executingAddress : null}
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
