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
};

export type CommandPaletteProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Group heading, e.g. "Simulator". */
    heading: string;
    actions: CommandPaletteAction[];
    placeholder?: string;
};

// ============================================================
// CommandPalette
// ============================================================

export function CommandPalette({
    open,
    onOpenChange,
    heading,
    actions,
    placeholder = "Type a command...",
}: CommandPaletteProps) {
    if (!open) {
        return null;
    }

    return (
        <div
            className="
                fixed
                inset-0
                z-50
                bg-black/50
                flex
                items-start
                justify-center
                pt-24
            "
            onMouseDown={() => onOpenChange(false)}
        >
            <Command
                className="
                    w-[600px]
                    overflow-hidden
                    rounded-lg
                    border
                    border-zinc-700
                    bg-zinc-900
                    shadow-2xl
                "
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div
                    className="
                        flex
                        items-center
                        gap-2
                        px-3
                        border-b
                        border-zinc-800
                    "
                >
                    <Search size={16} className="text-zinc-500" />

                    <Command.Input
                        autoFocus
                        placeholder={placeholder}
                        className="
                            h-12
                            w-full
                            bg-transparent
                            outline-none
                            text-sm
                        "
                    />
                </div>

                <Command.List className="max-h-80 overflow-y-auto p-2">
                    <Command.Empty className="p-4 text-sm text-zinc-500">
                        No commands found.
                    </Command.Empty>

                    <Command.Group
                        heading={heading}
                        className="px-1 py-2 text-xs text-zinc-500"
                    >
                        {actions.map(({ id, label, icon: Icon, onSelect }) => (
                            <Command.Item
                                key={id}
                                onSelect={() => {
                                    onSelect();
                                    onOpenChange(false);
                                }}
                                className="
                                    flex
                                    items-center
                                    gap-3
                                    rounded
                                    px-3
                                    py-2
                                    text-sm
                                    cursor-pointer
                                    aria-selected:bg-zinc-800
                                "
                            >
                                <Icon size={15} />
                                {label}
                            </Command.Item>
                        ))}
                    </Command.Group>
                </Command.List>
            </Command>
        </div>
    );
}

export default CommandPalette;
