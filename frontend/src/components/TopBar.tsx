"use client";

import {
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
    onRun: () => void;
    onStop: () => void;
    onStep: () => void;
    onReset: () => void;
    onOpenCommandPalette: () => void;
};

// ============================================================
// TopBar
// ============================================================

export function TopBar({
    title,
    isRunning,
    onRun,
    onStop,
    onStep,
    onReset,
    onOpenCommandPalette,
}: TopBarProps) {
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
                className="
                    flex
                    items-center
                    gap-1.5
                    px-2.5
                    py-1.5
                    rounded
                    text-xs
                    hover:bg-zinc-800
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
                className="
                    flex
                    items-center
                    gap-1.5
                    px-2.5
                    py-1.5
                    rounded
                    text-xs
                    hover:bg-zinc-800
                "
            >
                <StepForward size={14} />
                Step
            </button>

            <button
                onClick={onReset}
                className="
                    flex
                    items-center
                    gap-1.5
                    px-2.5
                    py-1.5
                    rounded
                    text-xs
                    hover:bg-zinc-800
                "
            >
                <RotateCcw size={14} />
                Reset
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
