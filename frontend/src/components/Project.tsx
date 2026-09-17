"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

type FilePath = string;

type ProjectProps = {
    id: string;
    title: string;
    architecture: string;
    fileTree: FilePath[];
};

export default function Project({
    id,
    title,
    architecture,
    fileTree,
}: ProjectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const titleId = useId();
    const router = useRouter();

    const loadProject = () => {
        router.push(`/editor/${id}/`);
    };

    const toggleFileTree = (
        event: React.MouseEvent<HTMLButtonElement>,
    ) => {
        event.stopPropagation();
        setIsOpen((open) => !open);
    };

    return (
        <section
            aria-labelledby={titleId}
            onClick={loadProject}
            className="
                w-full
                cursor-pointer
                overflow-hidden
                rounded-lg
                border
                border-zinc-700
                bg-zinc-900
                text-zinc-100
                shadow-sm
                transition
                hover:border-zinc-600
                hover:shadow-lg
            "
        >
            {/* Header */}
            <div
                className="
                    flex
                    w-full
                    items-center
                    justify-between
                    gap-4
                    p-4
                    text-left
                    transition
                    hover:bg-zinc-800
                "
            >
                <div className="flex min-w-0 items-center gap-3">
                    {/* Project icon */}
                    <div
                        className="
                            flex
                            h-10
                            w-10
                            shrink-0
                            items-center
                            justify-center
                            rounded-md
                            bg-zinc-800
                            text-zinc-400
                        "
                    >
                        📁
                    </div>

                    {/* Project information */}
                    <div className="min-w-0">
                        <h2
                            id={titleId}
                            className="truncate text-sm font-semibold"
                        >
                            {title}
                        </h2>

                        <div className="mt-1 flex items-center gap-2">
                            <span
                                className="
                                    rounded
                                    bg-zinc-800
                                    px-2
                                    py-0.5
                                    font-mono
                                    text-[11px]
                                    text-zinc-400
                                "
                            >
                                {architecture}
                            </span>

                            <span className="text-xs text-zinc-500">
                                {fileTree.length}{" "}
                                {fileTree.length === 1
                                    ? "file"
                                    : "files"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* File tree toggle */}
                <button
                    type="button"
                    onClick={toggleFileTree}
                    aria-expanded={isOpen}
                    aria-controls={`${titleId}-files`}
                    aria-label={`${isOpen ? "Hide" : "Show"} files for ${title}`}
                    className="
                        flex
                        h-8
                        w-8
                        shrink-0
                        items-center
                        justify-center
                        rounded-md
                        text-zinc-500
                        transition
                        hover:bg-zinc-700
                        hover:text-zinc-200
                        focus:outline-none
                        focus:ring-2
                        focus:ring-zinc-400
                    "
                >
                    <span
                        className={`
                            transition-transform
                            duration-200
                            ${isOpen ? "rotate-180" : ""}
                        `}
                        aria-hidden="true"
                    >
                        ▼
                    </span>
                </button>
            </div>

            {/* File tree */}
            {isOpen && (
                <div
                    id={`${titleId}-files`}
                    role="region"
                    aria-labelledby={titleId}
                    className="
                        border-t
                        border-zinc-800
                        bg-zinc-950/50
                    "
                    onClick={(event) => event.stopPropagation()}
                >
                    {fileTree.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-zinc-600">
                            No files in this project.
                        </div>
                    ) : (
                        <ul className="divide-y divide-zinc-800/50">
                            {fileTree.map((file) => (
                                <li
                                    key={file}
                                    className="
                                        flex
                                        items-center
                                        gap-3
                                        px-4
                                        py-2
                                        font-mono
                                        text-xs
                                        text-zinc-400
                                        transition
                                        hover:bg-zinc-900
                                        hover:text-zinc-200
                                    "
                                >
                                    <span
                                        className="text-zinc-600"
                                        aria-hidden="true"
                                    >
                                        └─
                                    </span>

                                    <span aria-hidden="true">📄</span>

                                    <span className="truncate">
                                        {file}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}