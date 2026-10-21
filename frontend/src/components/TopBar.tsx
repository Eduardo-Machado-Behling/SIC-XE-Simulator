"use client";

import {
    Eraser,
    Play,
    RotateCcw,
    Search,
    Square,
    StepForward,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

export type TopBarProps = {
    title: string;
    isRunning: boolean;
    /** When set, Run, Step, Reset and Clear are disabled and show this as their tooltip. */
    executionDisabledReason?: string | null;
    onRun: () => void;
    onStop: () => void;
    onStep: () => void;
    onReset: () => void;
    onClear: () => void;
    onOpenCommandPalette: () => void;
};

// ============================================================
// TopBar
// ============================================================

export function TopBar({
    title,
    isRunning,
    executionDisabledReason = null,
    onRun,
    onStop,
    onStep,
    onReset,
    onClear,
    onOpenCommandPalette,
}: TopBarProps) {
    const blocked = Boolean(executionDisabledReason);
    const disabledTitle = executionDisabledReason ?? undefined;

    return (
        <header
            className="
                h-12
                shrink-0
                border-b
                border-zinc-800
                bg-zinc-900
                flex
                items-center
                px-3
                gap-2
            "
        >
            <div className="font-semibold text-sm mr-4">{title}</div>

            <button
                onClick={isRunning ? onStop : onRun}
                disabled={!isRunning && blocked}
                title={isRunning ? undefined : disabledTitle}
                className="
                    flex
                    items-center
                    gap-1.5
                    px-2.5
                    py-1.5
                    rounded
                    text-xs
                    hover:bg-zinc-800
                    disabled:opacity-40
                    disabled:cursor-not-allowed
                    disabled:hover:bg-transparent
                "
            >
                {isRunning ? (
                    <>
                        <Square size={14} />
                        Stop
                    </>
                ) : (
                    <>
                        <Play size={14} />
                        Run
                    </>
                )}
            </button>

            <button
                onClick={onStep}
                disabled={blocked}
                title={disabledTitle}
                className="
                    flex
                    items-center
                    gap-1.5
                    px-2.5
                    py-1.5
                    rounded
                    text-xs
                    hover:bg-zinc-800
                    disabled:opacity-40
                    disabled:cursor-not-allowed
                    disabled:hover:bg-transparent
                "
            >
                <StepForward size={14} />
                Step
            </button>

            <button
                onClick={onReset}
                disabled={blocked}
                title={disabledTitle}
                className="
                    flex
                    items-center
                    gap-1.5
                    px-2.5
                    py-1.5
                    rounded
                    text-xs
                    hover:bg-zinc-800
                    disabled:opacity-40
                    disabled:cursor-not-allowed
                    disabled:hover:bg-transparent
                "
            >
                <RotateCcw size={14} />
                Reset
            </button>

            <button
                onClick={onClear}
                disabled={blocked}
                title={disabledTitle ?? "Clear memory, assembly data, and registers"}
                className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-zinc-400 transition hover:bg-red-950/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
            >
                <Eraser size={14} />
                Clear
            </button>

            <div className="flex-1" />

            <button
                onClick={onOpenCommandPalette}
                className="
                    flex
                    items-center
                    gap-2
                    px-3
                    py-1.5
                    rounded
                    border
                    border-zinc-700
                    bg-zinc-950
                    text-xs
                    text-zinc-400
                    hover:text-zinc-200
                "
            >
                <Search size={14} />
                <span>Search / Commands</span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                    Ctrl ⇧ P
                </kbd>
            </button>
        </header>
    );
}

export default TopBar;
