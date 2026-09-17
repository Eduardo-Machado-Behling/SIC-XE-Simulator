"use client";

import { useMemo } from "react";

export type MemoryTableProps = {
    memory: Map<number, number>;
    addressSpaceSize: number;

    /** First address displayed. */
    offset?: number;

    /** Number of bytes displayed. */
    windowSize?: number;

    label?: string;
    bytesPerRow?: number;
};

const DEFAULT_WINDOW_SIZE = 1 << 8;

export function MemoryTable({
    memory,
    addressSpaceSize,
    offset = 0,
    windowSize = DEFAULT_WINDOW_SIZE,
    label = "Memory",
    bytesPerRow = 16,
}: MemoryTableProps) {
    /*
     * Keep the window inside the actual address space.
     */
    const maxOffset = Math.max(
        0,
        addressSpaceSize - windowSize,
    );

    const startAddress = Math.min(
        Math.max(0, offset),
        maxOffset,
    );

    /*
     * Align the window to a row.
     *
     * Example:
     *
     * offset = 0x123
     * bytesPerRow = 16
     *
     * becomes:
     *
     * 0x120
     */
    const alignedOffset =
        Math.floor(startAddress / bytesPerRow) *
        bytesPerRow;

    const endAddress = Math.min(
        alignedOffset + windowSize,
        addressSpaceSize,
    );

    /*
     * Generate ONLY the rows in the current 1 KiB window.
     */
    const rows = useMemo(() => {
        const result = [];

        for (
            let address = alignedOffset;
            address < endAddress;
            address += bytesPerRow
        ) {
            result.push(
                <tr
                    key={address}
                    className="
                        h-7
                        text-sm
                        border-b
                        border-zinc-800
                        hover:bg-zinc-800
                    "
                >
                    {/* Address */}
                    <td
                        className="
                            px-3
                            font-mono
                            text-zinc-500
                            whitespace-nowrap
                        "
                    >
                        {address
                            .toString(16)
                            .toUpperCase()
                            .padStart(6, "0")}
                    </td>

                    {/* Bytes */}
                    {Array.from(
                        { length: bytesPerRow },
                        (_, byteOffset) => {
                            const byteAddress =
                                address + byteOffset;

                            /*
                             * IMPORTANT:
                             *
                             * Read the sparse Map using the
                             * actual memory address.
                             */
                            const value =
                                byteAddress < addressSpaceSize
                                    ? memory.get(
                                          byteAddress,
                                      ) ?? 0
                                    : 0;

                            return (
                                <td
                                    key={byteOffset}
                                    className={`
                                        px-1
                                        text-center
                                        font-mono
                                        tabular-nums
                                        ${
                                            value !== 0
                                                ? "text-zinc-100"
                                                : "text-zinc-600"
                                        }
                                    `}
                                >
                                    {value
                                        .toString(16)
                                        .toUpperCase()
                                        .padStart(2, "0")}
                                </td>
                            );
                        },
                    )}
                </tr>,
            );
        }

        return result;
    }, [
        alignedOffset,
        endAddress,
        bytesPerRow,
        memory,
        addressSpaceSize,
    ]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-zinc-900">
            {/* Header */}
            <div
                className="
                    h-10
                    shrink-0
                    px-3
                    flex
                    items-center
                    justify-between
                    text-xs
                    font-semibold
                    uppercase
                    tracking-wide
                    text-zinc-400
                "
            >
                <span>{label}</span>

                <span className="font-mono text-zinc-600">
                    0x
                    {alignedOffset
                        .toString(16)
                        .toUpperCase()
                        .padStart(6, "0")}
                </span>
            </div>

            {/* Table */}
            <div
                className="
                    flex-1
                    min-h-0
                    overflow-auto
                "
            >
                <table
                    className="
                        border-collapse
                        w-max
                        min-w-full
                    "
                >
                    <thead
                        className="
                            sticky
                            top-0
                            z-10
                            bg-zinc-900
                            border-b
                            border-zinc-800
                        "
                    >
                        <tr
                            className="
                                h-7
                                text-[11px]
                                uppercase
                                tracking-wide
                                text-zinc-500
                            "
                        >
                            <th
                                className="
                                    px-3
                                    text-left
                                    font-medium
                                "
                            >
                                Address
                            </th>

                            {Array.from(
                                { length: bytesPerRow },
                                (_, offset) => (
                                    <th
                                        key={offset}
                                        className="
                                            px-1
                                            text-center
                                            font-medium
                                            font-mono
                                        "
                                    >
                                        {offset
                                            .toString(16)
                                            .toUpperCase()
                                            .padStart(2, "0")}
                                    </th>
                                ),
                            )}
                        </tr>
                    </thead>

                    <tbody>
                        {rows}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default MemoryTable;