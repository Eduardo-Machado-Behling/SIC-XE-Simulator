"use client";

import { useMemo } from "react";

// ============================================================
// Types
// ============================================================

export type RegisterState = {
    id: number;
    name: string;
    value: number;
};

export type RegisterTableProps = {
    registers: RegisterState[];
    label?: string;
    valueWidth?: number;
};

// ============================================================
// RegisterTable
// ============================================================

export function RegisterTable({
    registers,
    label = "Registers",
    valueWidth = 6,
}: RegisterTableProps) {
    const values = useMemo(
        () =>
            registers.map((register) =>
                register.value
                    .toString(16)
                    .toUpperCase()
                    .padStart(valueWidth, "0"),
            ),
        [registers, valueWidth],
    );

    return (
        <aside
            className="
                w-full
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

            <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
                <div className="flex flex-wrap gap-2">
                    {registers.map((register, index) => (
                        <div
                            key={register.id}
                            className="
                                inline-flex
                                items-center
                                gap-2
                                rounded
                                border
                                border-zinc-700
                                bg-zinc-800
                                px-2
                                py-1
                                text-xs
                                hover:bg-zinc-750
                            "
                        >
                            <span
                                className="
                                    font-medium
                                    text-zinc-300
                                "
                            >
                                {register.name}
                            </span>

                            <span
                                className="
                                    font-mono
                                    text-zinc-400
                                "
                            >
                                0x{values[index]}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}

export default RegisterTable;