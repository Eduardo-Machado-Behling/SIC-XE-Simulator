"use client";

import { Command } from "cmdk";
import { Search, type LucideIcon } from "lucide-react";

// ============================================================
// Types
// ============================================================

export type CommandPaletteAction = {
    id: string;
    label: string;
    icon: LucideIcon;
    onSelect: () => void;
    /** Keyboard shortcut shown next to the label, e.g. "F5". */
    shortcut?: string;
};

export type CommandPaletteProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Group heading, e.g. "Simulator". */
    heading: string;
    actions: CommandPaletteAction[];
    placeholder?: string;
    emptyText?: string;
};

// ============================================================
// CommandPalette
// ============================================================

export function CommandPalette({
    open,
    onOpenChange,
    heading,
    actions,
    placeholder = "Type a command…",
    emptyText = "No commands found.",
}: CommandPaletteProps) {
    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-24" onMouseDown={() => onOpenChange(false)}>
            <Command
                className="w-full max-w-[600px] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
            >
                {/* The palette's only field: the open palette itself shows where focus is. */}
                <div className="flex items-center gap-2 border-b border-zinc-800 px-3">
                    <Search size={16} className="text-zinc-400" aria-hidden="true" />
                    <Command.Input autoFocus placeholder={placeholder} className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-zinc-400" />
                </div>

                <Command.List className="max-h-80 overflow-y-auto p-2">
                    <Command.Empty className="p-4 text-sm text-zinc-400">{emptyText}</Command.Empty>

                    <Command.Group heading={heading} className="px-1 py-2 text-xs text-zinc-400">
                        {actions.map(({ id, label, icon: Icon, onSelect, shortcut }) => (
                            <Command.Item
                                key={id}
                                onSelect={() => {
                                    onSelect();
                                    onOpenChange(false);
                                }}
                                className="flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm text-zinc-100 aria-selected:bg-zinc-800"
                            >
                                <Icon size={15} aria-hidden="true" />
                                <span className="flex-1">{label}</span>
                                {shortcut && <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-sans text-xs text-zinc-300">{shortcut}</kbd>}
                            </Command.Item>
                        ))}
                    </Command.Group>
                </Command.List>
            </Command>
        </div>
    );
}

export default CommandPalette;
