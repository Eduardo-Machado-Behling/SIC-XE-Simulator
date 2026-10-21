"use client";

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
    Pencil,
    Trash2,
} from "lucide-react";

export type FileNode = {
    id: string;
    name: string;
    children?: FileNode[];
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
}: {
    node: NodeApi<FileNode>;
    style: React.CSSProperties;
    dragHandle?: (el: HTMLDivElement | null) => void;
    activeFile: string;
    selectedId: string | null;
    onSelectFile: (path: string) => void;
    onSelectNode: (path: string) => void;
}) {
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
                : <File size={15} className="text-zinc-500" />}
            <span className="truncate">{node.data.name}</span>
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
    label = "Explorer",
}: FileExplorerProps) {
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
        if (!selectedId || !selectedNode) return;
        const name = window.prompt("Rename", selectedNode.name)?.trim();
        if (name && name !== selectedNode.name && !name.includes("/") && !name.includes("\\")) {
            onRename(selectedId, name);
            setSelectedId(null);
        }
    };

    const deleteSelected = () => {
        if (!selectedId || !selectedNode) return;
        const kind = selectedIsFolder ? "folder and everything inside it" : "file";
        if (window.confirm(`Delete this ${kind}?`)) {
            onDelete([selectedId]);
            setSelectedId(null);
        }
    };

    return (
        <aside className="flex h-full flex-col border-r border-zinc-800 bg-zinc-900">
            <div className="flex h-10 shrink-0 items-center justify-between px-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <span>{label}</span>
                <div className="flex items-center gap-1">
                    <ActionButton title={`New file in ${parentFolder || "project"}`} onClick={() => onCreateFile(parentFolder)}>
                        <FilePlus2 size={15} />
                    </ActionButton>
                    <ActionButton title={`New folder in ${parentFolder || "project"}`} onClick={() => onCreateFolder(parentFolder)}>
                        <FolderPlus size={15} />
                    </ActionButton>
                    <ActionButton title="Rename selected item" disabled={!selectedId} onClick={renameSelected}>
                        <Pencil size={14} />
                    </ActionButton>
                    <ActionButton title="Delete selected item" disabled={!selectedId} onClick={deleteSelected} danger>
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
            className={`rounded p-1 transition disabled:cursor-not-allowed disabled:opacity-30 ${
                danger ? "text-zinc-500 hover:bg-red-950/50 hover:text-red-300" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
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
