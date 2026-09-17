"use client";

import { useEffect, useRef, useState } from "react";
import { Tree, type NodeApi } from "react-arborist";
import {
    ChevronDown,
    ChevronRight,
    File,
    Folder,
    FolderOpen,
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
}: {
    node: NodeApi<FileNode>;
    style: React.CSSProperties;
    dragHandle?: (el: HTMLDivElement | null) => void;
    activeFile: string;
    onSelectFile: (path: string) => void;
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
}: FileExplorerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [treeHeight, setTreeHeight] = useState(600);

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
            </div>

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
                        />
                    )}
                </Tree>
            </div>
        </aside>
    );
}

export default FileExplorer;
