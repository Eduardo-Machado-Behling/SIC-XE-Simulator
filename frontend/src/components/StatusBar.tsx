"use client";

import { useT } from "@/lib/i18n";

export type StatusBarProps = {
    left: string;
    activeFile: string;
    // The file the last Run assembled and loaded, or null before any Run.
    loadedFile?: string | null;
    language?: string;
};

export function StatusBar({ left, activeFile, loadedFile = null, language = "Assembly" }: StatusBarProps) {
    const t = useT();
    return (
        <footer className="flex h-6 shrink-0 items-center bg-blue-700 px-3 text-xs text-white">
            <span>{left}</span>
            <span className="mx-3" aria-hidden="true">|</span>
            <span>{activeFile}</span>

            <div className="flex-1" />

            <span>{loadedFile ? t("status.loaded", { file: loadedFile }) : t("status.nothingLoaded")}</span>
            <span className="mx-3" aria-hidden="true">|</span>
            <span>{language}</span>
        </footer>
    );
}

export default StatusBar;
