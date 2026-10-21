"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, FileCode2, FolderCode } from "lucide-react";

type FilePath = string;

type ProjectProps = {
    id: string;
    title: string;
    architecture: string;
    fileTree: FilePath[];
};

export default function Project({ id, title, architecture, fileTree }: ProjectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const titleId = useId();

    return (
        <section aria-labelledby={titleId} className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/65 text-zinc-100 shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-blue-400/25 hover:bg-zinc-900 hover:shadow-xl hover:shadow-black/20">
            <div className="flex items-start gap-3 p-5">
                <Link href={`/editor/${id}/`} aria-labelledby={titleId} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-400/[0.07] text-blue-300 transition group-hover:bg-blue-400/[0.12]">
                        <FolderCode size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="truncate pt-0.5 text-sm font-semibold tracking-tight">{title}</h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-white/[0.07] bg-white/[0.035] px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-zinc-400">{architecture}</span>
                            <span className="text-xs text-zinc-500">{fileTree.length} {fileTree.length === 1 ? "file" : "files"}</span>
                        </div>
                    </div>
                    <ArrowUpRight size={16} className="mt-1 shrink-0 text-zinc-600 transition group-hover:text-blue-300" />
                </Link>
                <button
                    type="button"
                    onClick={() => setIsOpen((open) => !open)}
                    aria-expanded={isOpen}
                    aria-controls={`${titleId}-files`}
                    aria-label={`${isOpen ? "Hide" : "Show"} files for ${title}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.07] hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                    <ChevronDown size={16} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
            </div>
            {isOpen && (
                <div id={`${titleId}-files`} role="region" aria-labelledby={titleId} className="border-t border-white/[0.07] bg-black/15">
                    {fileTree.length === 0 ? (
                        <div className="px-5 py-6 text-center text-sm text-zinc-600">No files in this project.</div>
                    ) : (
                        <ul className="divide-y divide-white/[0.04]">
                            {fileTree.slice(0, 5).map((file) => (
                                <li key={file} className="flex items-center gap-2.5 px-5 py-2.5 font-mono text-[11px] text-zinc-500">
                                    <FileCode2 size={13} className="shrink-0 text-zinc-600" aria-hidden="true" />
                                    <span className="truncate">{file}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {fileTree.length > 5 && <p className="px-5 py-2 text-[11px] text-zinc-600">and {fileTree.length - 5} more files</p>}
                </div>
            )}
        </section>
    );
}
