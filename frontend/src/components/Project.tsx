"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileCode2, FolderCode } from "lucide-react";

import { useT } from "@/lib/i18n";

type FilePath = string;

type ProjectProps = {
    id: string;
    title: string;
    architecture: string;
    fileTree: FilePath[];
};

export default function Project({ id, title, architecture, fileTree }: ProjectProps) {
    const t = useT();
    const [isOpen, setIsOpen] = useState(false);
    const titleId = useId();

    return (
        <section aria-labelledby={titleId} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-100 hover:border-zinc-600">
            <div className="flex items-start gap-3 p-4">
                <Link href={`/editor/${id}/`} aria-labelledby={titleId} className="flex min-w-0 flex-1 items-start gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
                    <FolderCode size={20} className="mt-0.5 shrink-0 text-blue-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="truncate text-sm font-semibold">{title}</h2>
                        <p className="mt-1 text-xs text-zinc-400">
                            <span className="font-mono">{architecture}</span>
                            {" · "}
                            {fileTree.length === 1 ? t("projects.file") : t("projects.files", { count: fileTree.length })}
                        </p>
                    </div>
                </Link>
                <button
                    type="button"
                    onClick={() => setIsOpen((open) => !open)}
                    aria-expanded={isOpen}
                    aria-controls={`${titleId}-files`}
                    aria-label={t(isOpen ? "projects.hideFiles" : "projects.showFiles", { title })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-400"
                >
                    <ChevronDown size={16} className={`transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
            </div>
            {isOpen && (
                <div id={`${titleId}-files`} role="region" aria-labelledby={titleId} className="border-t border-zinc-800">
                    {fileTree.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-zinc-400">{t("projects.noFiles")}</p>
                    ) : (
                        <ul className="divide-y divide-zinc-800">
                            {fileTree.slice(0, 5).map((file) => (
                                <li key={file} className="flex items-center gap-2 px-4 py-2 font-mono text-xs text-zinc-300">
                                    <FileCode2 size={13} className="shrink-0 text-zinc-400" aria-hidden="true" />
                                    <span className="truncate">{file}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {fileTree.length > 5 && <p className="px-4 py-2 text-xs text-zinc-400">{t("projects.moreFiles", { count: fileTree.length - 5 })}</p>}
                </div>
            )}
        </section>
    );
}
