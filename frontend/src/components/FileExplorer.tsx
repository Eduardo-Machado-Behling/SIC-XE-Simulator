"use client";

import { useEffect, useRef, useState } from "react";
import { Tree, type NodeApi } from "react-arborist";
import {
    ChevronDown,
    ChevronRight,
    File,
    FilePlus,
    Folder,
    FolderOpen,
    Trash2,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

export type FileNode = {
    id: string;
    name: string;
    children?: FileNode[];
};

export type FileExplorerProps = {
    /** Tree structure to render (folders + files). */
    tree: FileNode[];
    /** Currently open file path, used to highlight the active row. */
    activeFile: string;
    /** Called with a file's id/path when the user selects a leaf node. */
    onSelectFile: (path: string) => void;
    /** Optional label shown in the panel header. Defaults to "Explorer". */
    label?: string;
    /** When given, the header offers "New file"; called with the typed path. */
    onCreateFile?: (path: string) => void;
    /** When given, each file row offers a delete button. */
    onDeleteFile?: (path: string) => void;
};

// ============================================================
// Row renderer
// ============================================================

function FileTreeRow({
    node,
    style,
    dragHandle,
    activeFile,
    onSelectFile,
    onDeleteFile,
}: {
    node: NodeApi<FileNode>;
    style: React.CSSProperties;
    dragHandle?: (el: HTMLDivElement | null) => void;
    activeFile: string;
    onSelectFile: (path: string) => void;
    onDeleteFile?: (path: string) => void;
}) {
    const isFolder = node.data.children !== undefined;
    const isOpen = node.isOpen;
    const isActive = !isFolder && node.data.id === activeFile;

    return (
        <div
            ref={dragHandle}
            style={style}
            className={`
                flex
                items-center
                gap-1
                px-2
                text-sm
                cursor-pointer
                select-none
                ${
                    isActive
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-300 hover:bg-zinc-800"
                }
            `}
            onClick={() => {
                if (isFolder) {
                    node.toggle();
                    return;
                }

                onSelectFile(node.data.id);
            }}
        >
            {isFolder ? (
                isOpen ? (
                    <ChevronDown size={14} />
                ) : (
                    <ChevronRight size={14} />
                )
            ) : (
                <span className="w-[14px]" />
            )}

            {isFolder ? (
                isOpen ? (
                    <FolderOpen size={15} />
                ) : (
                    <Folder size={15} />
                )
            ) : (
                <File size={15} />
            )}

            <span>{node.data.name}</span>

            {onDeleteFile && !isFolder && (
                <button
                    type="button"
                    aria-label={`Delete ${node.data.id}`}
                    title={`Delete ${node.data.id}`}
                    onClick={(event) => {
                        event.stopPropagation();
                        onDeleteFile(node.data.id);
                    }}
                    className="ml-auto rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-red-300"
                >
                    <Trash2 size={13} />
                </button>
            )}
        </div>
    );
}

// ============================================================
// FileExplorer
// ============================================================

export function FileExplorer({
    tree,
    activeFile,
    onSelectFile,
    label = "Explorer",
    onCreateFile,
    onDeleteFile,
}: FileExplorerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [treeHeight, setTreeHeight] = useState(600);
    const [newPath, setNewPath] = useState<string | null>(null);

    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            const height = entries[0]?.contentRect.height;

            if (height) {
                setTreeHeight(height);
            }
        });

        observer.observe(containerRef.current);

        return () => observer.disconnect();
    }, []);

    return (
        <aside
            className="
                h-full
                bg-zinc-900
                border-r
                border-zinc-800
                flex
                flex-col
            "
        >
            <div
                className="
                    h-10
                    shrink-0
                    px-3
                    flex
                    items-center
                    text-xs
                    font-semibold
                    uppercase
                    tracking-wide
                    text-zinc-400
                "
            >
                {label}

                {onCreateFile && (
                    <button
                        type="button"
                        aria-label="New file"
                        title="New file"
                        onClick={() => setNewPath("")}
                        className="ml-auto rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    >
                        <FilePlus size={14} />
                    </button>
                )}
            </div>

            {onCreateFile && newPath !== null && (
                <input
                    autoFocus
                    aria-label="New file path"
                    placeholder="src/file.asm"
                    value={newPath}
                    onChange={(event) => setNewPath(event.target.value)}
                    onBlur={() => setNewPath(null)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") setNewPath(null);
                        if (event.key === "Enter") {
                            const path = newPath.trim();
                            setNewPath(null);
                            if (path) onCreateFile(path);
                        }
                    }}
                    className="mx-2 mb-1 rounded bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-blue-500"
                />
            )}

            <div ref={containerRef} className="flex-1 min-h-0">
                <Tree<FileNode>
                    data={tree}
                    width="100%"
                    height={treeHeight}
                    rowHeight={28}
                    indent={16}
                    openByDefault
                    onActivate={(node) => {
                        if (node.data.children) {
                            return;
                        }

                        onSelectFile(node.data.id);
                    }}
                >
                    {(props) => (
                        <FileTreeRow
                            {...props}
                            activeFile={activeFile}
                            onSelectFile={onSelectFile}
                            onDeleteFile={onDeleteFile}
                        />
                    )}
                </Tree>
            </div>
        </aside>
    );
}

export default FileExplorer;
