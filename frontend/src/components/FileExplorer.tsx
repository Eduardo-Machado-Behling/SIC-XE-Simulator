"use client";

import { useT } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Tree, type NodeApi } from "react-arborist";
import {
    ChevronDown,
    ChevronRight,
    File,
    FilePlus2,
    Folder,
    FolderOpen,
    FolderPlus,
    Lock,
    Pencil,
    Trash2,
} from "lucide-react";

export type FileNode = {
    id: string;
    name: string;
    children?: FileNode[];
    /** Read-only file produced by the macro processor. */
    generated?: boolean;
    /** An assembly source that Run can link; `included` says whether it is switched on. */
    linkable?: boolean;
    included?: boolean;
    /** The source holds ENTRY: the linked program starts in it. */
    entry?: boolean;
};

export type FileExplorerProps = {
    tree: FileNode[];
    activeFile: string;
    onSelectFile: (path: string) => void;
    onCreateFile: (path: string) => void;
    onCreateFolder: (path: string) => void;
    onDelete: (paths: string[]) => void;
    onRename: (path: string, name: string) => void;
    onMove: (paths: string[], targetFolder: string) => void;
    /** Switches a file in or out of the set Run links. */
    onToggleLink?: (path: string) => void;
    label?: string;
};

function FileTreeRow({
    node,
    style,
    dragHandle,
    activeFile,
    selectedId,
    onSelectFile,
    onSelectNode,
    onToggleLink,
}: {
    node: NodeApi<FileNode>;
    style: React.CSSProperties;
    dragHandle?: (el: HTMLDivElement | null) => void;
    activeFile: string;
    selectedId: string | null;
    onSelectFile: (path: string) => void;
    onSelectNode: (path: string) => void;
    onToggleLink?: (path: string) => void;
}) {
    const t = useT();
    const isFolder = node.data.children !== undefined;
    const isActive = !isFolder && node.data.id === activeFile;
    const isSelected = node.data.id === selectedId;

    return (
        <div
            ref={dragHandle}
            style={style}
            className={`flex cursor-pointer select-none items-center gap-1 px-2 text-sm ${
                isActive
                    ? "bg-zinc-800 text-zinc-100"
                    : isSelected
                      ? "bg-zinc-800/70 text-zinc-100"
                      : "text-zinc-300 hover:bg-zinc-800/70"
            }`}
            onClick={() => {
                onSelectNode(node.data.id);
                if (isFolder) node.toggle();
                else onSelectFile(node.data.id);
            }}
            onContextMenu={(event) => {
                event.preventDefault();
                onSelectNode(node.data.id);
            }}
            title={node.data.id}
        >
            {isFolder ? (
                node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : <span className="w-[14px]" />}
            {isFolder
                ? node.isOpen ? <FolderOpen size={15} className="text-sky-300" /> : <Folder size={15} className="text-sky-300" />
                : node.data.generated
                    ? <Lock size={15} className="text-amber-300" />
                    : <File size={15} className="text-zinc-400" />}
            <span className="truncate">{node.data.name}</span>
            {node.data.generated && (
                <span className="ml-auto rounded bg-amber-950/60 px-1.5 text-[11px] uppercase tracking-wide text-amber-300">
                    {t("explorer.generated")}
                </span>
            )}
            {(node.data.entry || node.data.linkable) && (
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {node.data.entry && (
                        <span title={t("explorer.entryHint")} className="rounded bg-emerald-950/60 px-1.5 text-[11px] uppercase tracking-wide text-emerald-300">
                            {t("explorer.entry")}
                        </span>
                    )}
                    {node.data.linkable && (
                        <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(node.data.included)}
                            aria-label={t("explorer.includeInLink", { file: node.data.name })}
                            title={t("explorer.includeInLink", { file: node.data.name })}
                            onClick={(event) => {
                                event.stopPropagation();
                                onToggleLink?.(node.data.id);
                            }}
                            className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400 ${
                                node.data.included ? "bg-blue-500" : "bg-zinc-700 hover:bg-zinc-600"
                            }`}
                        >
                            <span
                                aria-hidden="true"
                                className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-[left] ${node.data.included ? "left-3" : "left-0.5"}`}
                            />
                        </button>
                    )}
                </span>
            )}
        </div>
    );
}

export function FileExplorer({
    tree,
    activeFile,
    onSelectFile,
    onCreateFile,
    onCreateFolder,
    onDelete,
    onRename,
    onMove,
    onToggleLink,
    label,
}: FileExplorerProps) {
    const t = useT();
    const containerRef = useRef<HTMLDivElement>(null);
    const [treeHeight, setTreeHeight] = useState(600);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const height = entries[0]?.contentRect.height;
            if (height) setTreeHeight(height);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const selectedNode = selectedId ? findNode(tree, selectedId) : null;
    const selectedIsFolder = selectedNode?.children !== undefined;
    const parentFolder = selectedId
        ? selectedIsFolder ? selectedId : selectedId.split("/").slice(0, -1).join("/")
        : "";

    const renameSelected = () => {
        if (!selectedId || !selectedNode || selectedNode.generated) return;
        const name = window.prompt(t("explorer.renamePrompt"), selectedNode.name)?.trim();
        if (name && name !== selectedNode.name && !name.includes("/") && !name.includes("\\")) {
            onRename(selectedId, name);
            setSelectedId(null);
        }
    };

    const deleteSelected = () => {
        if (!selectedId || !selectedNode) return;
        if (window.confirm(t(selectedIsFolder ? "explorer.deleteFolder" : "explorer.deleteFile"))) {
            onDelete([selectedId]);
            setSelectedId(null);
        }
    };

    return (
        <aside className="flex h-full flex-col border-r border-zinc-800 bg-zinc-900">
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <h2 className="min-w-0 truncate">{label ?? t("explorer.title")}</h2>
                <div className="flex shrink-0 items-center">
                    <ActionButton title={t("explorer.newFileIn", { folder: parentFolder || t("explorer.project") })} onClick={() => onCreateFile(parentFolder)}>
                        <FilePlus2 size={15} />
                    </ActionButton>
                    <ActionButton title={t("explorer.newFolderIn", { folder: parentFolder || t("explorer.project") })} onClick={() => onCreateFolder(parentFolder)}>
                        <FolderPlus size={15} />
                    </ActionButton>
                    <ActionButton title={t("explorer.rename")} disabled={!selectedId || selectedNode?.generated} onClick={renameSelected}>
                        <Pencil size={14} />
                    </ActionButton>
                    <ActionButton title={t("explorer.delete")} disabled={!selectedId} onClick={deleteSelected} danger>
                        <Trash2 size={14} />
                    </ActionButton>
                </div>
            </div>

            <div ref={containerRef} className="min-h-0 flex-1">
                <Tree<FileNode>
                    data={tree}
                    width="100%"
                    height={treeHeight}
                    rowHeight={28}
                    indent={16}
                    openByDefault
                    disableDrag={(node) => node.generated === true}
                    disableEdit={(node) => node.generated === true}
                    onMove={({ dragIds, parentId }) => onMove(dragIds, parentId ?? "")}
                    onActivate={(node) => {
                        setSelectedId(node.data.id);
                        if (node.data.children === undefined) onSelectFile(node.data.id);
                    }}
                >
                    {(props) => (
                        <FileTreeRow
                            {...props}
                            activeFile={activeFile}
                            selectedId={selectedId}
                            onSelectFile={onSelectFile}
                            onSelectNode={setSelectedId}
                            onToggleLink={onToggleLink}
                        />
                    )}
                </Tree>
            </div>
        </aside>
    );
}

function ActionButton({
    children,
    title,
    disabled,
    danger,
    onClick,
}: {
    children: React.ReactNode;
    title: string;
    disabled?: boolean;
    danger?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            disabled={disabled}
            onClick={onClick}
            className={`flex h-6 w-6 items-center justify-center rounded transition focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-30 ${
                danger ? "text-zinc-400 hover:bg-red-950/50 hover:text-red-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
        >
            {children}
        </button>
    );
}

function findNode(nodes: FileNode[], id: string): FileNode | null {
    for (const node of nodes) {
        if (node.id === id) return node;
        const child = node.children && findNode(node.children, id);
        if (child) return child;
    }
    return null;
}

export default FileExplorer;
