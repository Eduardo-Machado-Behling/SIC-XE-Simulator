"use client";

import Link from "next/link";
import { ChevronLeft, Eraser, Play, RotateCcw, Search, StepForward } from "lucide-react";

import { LanguageSwitch, useT } from "@/lib/i18n";

// ============================================================
// Types
// ============================================================

export type TopBarProps = {
    title: string;
    onRun: () => void;
    onStep: () => void;
    onReset: () => void;
    onClear: () => void;
    onOpenCommandPalette: () => void;
};

const GHOST = "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-400";

// ============================================================
// TopBar
// ============================================================

export function TopBar({ title, onRun, onStep, onReset, onClear, onOpenCommandPalette }: TopBarProps) {
    const t = useT();
    return (
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3">
            <Link
                href="/"
                aria-label={t("top.back")}
                title={t("top.back")}
                className="flex h-7 w-7 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-400"
            >
                <ChevronLeft size={16} aria-hidden="true" />
            </Link>
            <div className="mr-3 min-w-0 truncate text-sm font-semibold">{title}</div>

            <button
                type="button"
                onClick={onRun}
                title={t("top.runHint")}
                aria-keyshortcuts="F5"
                className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
                <Play size={14} aria-hidden="true" />
                {t("top.run")}
            </button>

            <button type="button" onClick={onStep} title={t("top.stepHint")} aria-keyshortcuts="F10" className={GHOST}>
                <StepForward size={14} aria-hidden="true" />
                {t("top.step")}
            </button>

            <button type="button" onClick={onReset} title={t("top.resetHint")} className={GHOST}>
                <RotateCcw size={14} aria-hidden="true" />
                {t("top.reset")}
            </button>

            <button type="button" onClick={onClear} title={t("top.clearHint")} className={`${GHOST} hover:bg-red-950/50 hover:text-red-200`}>
                <Eraser size={14} aria-hidden="true" />
                {t("top.clear")}
            </button>

            <div className="flex-1" />

            <button
                type="button"
                onClick={onOpenCommandPalette}
                aria-keyshortcuts="Control+Shift+P"
                className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-400"
            >
                <Search size={14} aria-hidden="true" />
                <span>{t("top.commands")}</span>
                <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-sans text-zinc-300">Ctrl ⇧ P</kbd>
            </button>

            <LanguageSwitch />
        </header>
    );
}

export default TopBar;
