"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
    centeredScrollTop,
    isValidAddress,
    mergeRowRanges,
    nextWriteMarks,
    rowCount,
    rowRange,
    type RowRange,
} from "@/components/memoryViewport";

export type MemoryTableProps = {
    memory: Map<number, number>;
    addressSpaceSize: number;

    label?: string;
    bytesPerRow?: number;
    /** Bytes written by the latest execution update. */
    changedAddresses?: number[];
    /** Incremented by the parent on every execution update. */
    changeRevision?: number;
    /** Highlighted and kept centred in the viewport. */
    pcAddress?: number;
    consumedAddresses?: number[];
    /** Changing it re-centres the PC row even when the PC did not move. */
    pcScrollRevision?: number;
};

/** Row pitch used until one can be measured: a 20px line plus 5px padding above and below. */
const DEFAULT_ROW_HEIGHT = 30;
/** Rows rendered beyond each edge of the viewport. */
const OVERSCAN = 4;
/** Length of the .sim-value-change animation in globals.css. */
const WRITE_EFFECT_MS = 720;

type Layout = {
    /** Height available to the rows, below the sticky column header. */
    viewportHeight: number;
    rowHeight: number;
};

function hex(value: number, width: number): string {
    return value.toString(16).toUpperCase().padStart(width, "0");
}

export function MemoryTable({
    memory,
    addressSpaceSize,
    label = "Memory",
    bytesPerRow = 16,
    changedAddresses = [],
    changeRevision = 0,
    pcAddress,
    consumedAddresses = [],
    pcScrollRevision = 0,
}: MemoryTableProps) {
    const regionRef = useRef<HTMLDivElement>(null);
    const headRef = useRef<HTMLTableSectionElement>(null);
    const [layout, setLayout] = useState<Layout>({ viewportHeight: 0, rowHeight: DEFAULT_ROW_HEIGHT });
    const [scrollTop, setScrollTop] = useState(0);
    // A browser drops scrollTop writes to a hidden (display:none) scroller, so
    // a centring done while the table's tab is hidden is redone when it shows.
    const centreWhenShownRef = useRef(false);
    const [shownRevision, setShownRevision] = useState(0);

    // Bytes written by the last two execution updates, keyed to the update
    // that wrote them. Updated while rendering when a new revision arrives
    // (React's "adjusting state when a prop changes" pattern). A parent that
    // later empties changedAddresses without a new revision keeps the marks.
    const [writes, setWrites] = useState(() => ({
        revision: changeRevision,
        marks: nextWriteMarks(new Map(), changeRevision, changedAddresses, changeRevision, addressSpaceSize),
    }));
    if (writes.revision !== changeRevision) {
        setWrites({
            revision: changeRevision,
            marks: nextWriteMarks(writes.marks, writes.revision, changedAddresses, changeRevision, addressSpaceSize),
        });
    }

    // Highest revision whose write animation has finished. Rows are mounted
    // and unmounted as they scroll in and out of the rendered range, and a
    // remounted value would start the animation again, so the animation class
    // is only given while the update that wrote the byte is recent. The
    // write mark (data-write) itself stays for the reduced-motion indicator.
    const [settledRevision, setSettledRevision] = useState(-Infinity);
    const settleTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
    useEffect(() => {
        const revision = writes.revision;
        const timers = settleTimersRef.current;
        const timer = setTimeout(() => {
            timers.delete(timer);
            setSettledRevision((settled) => Math.max(settled, revision));
        }, WRITE_EFFECT_MS);
        // Not cleared when the next update arrives: this update's effects
        // keep playing alongside the next one's.
        timers.add(timer);
    }, [writes.revision]);
    useEffect(() => {
        const timers = settleTimersRef.current;
        return () => {
            for (const timer of timers) clearTimeout(timer);
            timers.clear();
        };
    }, []);

    const consumed = useMemo(() => new Set(consumedAddresses), [consumedAddresses]);
    const totalRows = rowCount(addressSpaceSize, bytesPerRow);
    const pcIsValid = pcAddress !== undefined && isValidAddress(pcAddress, addressSpaceSize);

    const pcScrollTop = centeredScrollTop({
        pcAddress,
        addressSpaceSize,
        bytesPerRow,
        rowHeight: layout.rowHeight,
        viewportHeight: layout.viewportHeight,
    });

    // Measure the rows viewport and the row pitch. Driven by ResizeObserver,
    // which also reports the initial size. A zero height means the table is
    // hidden (an inactive tab), so the last real measurement is kept.
    const measure = useCallback(() => {
        const region = regionRef.current;
        if (!region || region.clientHeight === 0) return;

        if (centreWhenShownRef.current) {
            centreWhenShownRef.current = false;
            setShownRevision((revision) => revision + 1);
        }

        const headerHeight = headRef.current?.getBoundingClientRect().height ?? 0;
        const rows = region.querySelectorAll<HTMLElement>("tr[data-memory-row]");
        let rowHeight = 0;
        for (let i = 1; i < rows.length && rowHeight <= 0; i++) {
            if (Number(rows[i].dataset.memoryRow) === Number(rows[i - 1].dataset.memoryRow) + 1) {
                rowHeight = rows[i].getBoundingClientRect().top - rows[i - 1].getBoundingClientRect().top;
            }
        }

        const next: Layout = {
            viewportHeight: Math.max(0, region.clientHeight - headerHeight),
            rowHeight: rowHeight > 0 ? rowHeight : DEFAULT_ROW_HEIGHT,
        };
        setLayout((current) =>
            Math.abs(current.viewportHeight - next.viewportHeight) < 0.5
                && Math.abs(current.rowHeight - next.rowHeight) < 0.5
                ? current
                : next,
        );
    }, []);

    useLayoutEffect(() => {
        const region = regionRef.current;
        if (!region) return;

        const observer = new ResizeObserver(measure);
        observer.observe(region);
        if (headRef.current) observer.observe(headRef.current);
        return () => observer.disconnect();
    }, [measure]);

    // Centre the PC row whenever the PC moves, an execution update arrives or
    // the viewport is resized, replacing any manual scroll position. The jump
    // is immediate: the rows around the PC are already rendered (see `blocks`).
    // While the table is hidden the write is lost, so it is repeated once the
    // table shows again; a manual scroll with no update in between is kept.
    useLayoutEffect(() => {
        const region = regionRef.current;
        if (!region || pcScrollTop === null) return;

        region.scrollTop = pcScrollTop;
        if (region.clientHeight === 0) centreWhenShownRef.current = true;
    }, [pcScrollTop, pcAddress, pcScrollRevision, shownRevision]);

    // Render only the rows near the scroll position, plus the rows near the
    // centred PC so they are there before the scroll event for the jump
    // arrives. Spacer rows keep the full height of the address space.
    const blocks = useMemo(() => {
        const ranges: RowRange[] = [rowRange({
            scrollTop,
            rowHeight: layout.rowHeight,
            viewportHeight: layout.viewportHeight,
            totalRows,
            overscan: OVERSCAN,
        })];
        if (pcScrollTop !== null) {
            ranges.push(rowRange({
                scrollTop: pcScrollTop,
                rowHeight: layout.rowHeight,
                viewportHeight: layout.viewportHeight,
                totalRows,
                overscan: OVERSCAN,
            }));
        }
        return mergeRowRanges(ranges);
    }, [scrollTop, pcScrollTop, layout, totalRows]);

    const renderRow = (row: number) => {
        const address = row * bytesPerRow;

        return (
            <tr
                key={address}
                data-memory-row={row}
                data-memory-address={address}
                className="text-sm leading-5 hover:bg-zinc-800"
            >
                <td className="px-3 py-[5px] font-mono text-zinc-500 whitespace-nowrap shadow-[inset_0_-1px_0_var(--color-zinc-800)]">
                    {hex(address, 6)}
                </td>

                {Array.from({ length: bytesPerRow }, (_, byteOffset) => {
                    const byteAddress = address + byteOffset;

                    // The last row of a space that is not a multiple of the
                    // row width has cells past the end: they stay empty.
                    if (byteAddress >= addressSpaceSize) {
                        return (
                            <td
                                key={byteOffset}
                                aria-hidden="true"
                                className="py-[5px] shadow-[inset_0_-1px_0_var(--color-zinc-800)]"
                            />
                        );
                    }

                    const value = memory.get(byteAddress) ?? 0;
                    const isPc = pcIsValid && byteAddress === pcAddress;
                    const isConsumed = consumed.has(byteAddress);
                    const writeRevision = writes.marks.get(byteAddress);
                    const writeState = writeRevision === undefined
                        ? undefined
                        : writeRevision === writes.revision ? "latest" : "settling";
                    const writeAnimates = writeRevision !== undefined && writeRevision > settledRevision;

                    return (
                        <td
                            key={`${byteOffset}-${isConsumed ? changeRevision : "stable"}`}
                            data-address={byteAddress}
                            aria-current={isPc ? "location" : undefined}
                            aria-label={isPc ? `Program counter: ${hex(byteAddress, 1)}` : undefined}
                            title={isPc ? "Program counter" : undefined}
                            className={`
                                px-0.5
                                py-[5px]
                                text-center
                                font-mono
                                tabular-nums
                                shadow-[inset_0_-1px_0_var(--color-zinc-800)]
                                ${value !== 0 ? "text-zinc-100" : "text-zinc-600"}
                                ${isPc ? "sim-pc-cell" : ""}
                                ${isConsumed ? "sim-instruction-consume" : ""}
                            `}
                        >
                            {/*
                              * The write effect lives on the value, not the cell,
                              * so it never hides the PC marker. Its key changes
                              * with every update that writes the byte, which
                              * remounts it and restarts the animation even when
                              * the value did not change. The animation class
                              * goes once the effect has had its time (see
                              * settledRevision).
                              */}
                            <span
                                key={writeRevision ?? "unwritten"}
                                data-byte-value=""
                                data-write={writeState}
                                className={`inline-block rounded px-1 ${writeAnimates ? "sim-value-change" : ""}`}
                            >
                                {hex(value, 2)}
                            </span>
                        </td>
                    );
                })}
            </tr>
        );
    };

    const body = [];
    let nextRow = 0;
    for (const block of blocks) {
        if (block.start > nextRow) {
            body.push(spacer(nextRow, block.start - nextRow, layout.rowHeight, bytesPerRow));
        }
        for (let row = block.start; row < block.end; row++) body.push(renderRow(row));
        nextRow = block.end;
    }
    if (totalRows > nextRow) {
        body.push(spacer(nextRow, totalRows - nextRow, layout.rowHeight, bytesPerRow));
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-zinc-900">
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

                {pcIsValid && (
                    <span className="font-mono normal-case text-zinc-600">
                        PC 0x{hex(pcAddress, 6)}
                    </span>
                )}
            </div>

            {/* Table */}
            <div
                ref={regionRef}
                role="region"
                aria-label={label}
                tabIndex={0}
                onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                className="flex-1 min-h-0 overflow-auto focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-zinc-600"
            >
                <table className="w-full min-w-[30rem] table-fixed border-collapse">
                    <thead ref={headRef} className="sticky top-0 z-10 bg-zinc-900">
                        <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                            <th className="w-20 px-3 py-[5px] text-left font-medium shadow-[inset_0_-1px_0_var(--color-zinc-800)]">
                                Address
                            </th>

                            {Array.from({ length: bytesPerRow }, (_, offset) => (
                                <th
                                    key={offset}
                                    className="px-0.5 py-[5px] text-center font-medium font-mono shadow-[inset_0_-1px_0_var(--color-zinc-800)]"
                                >
                                    {hex(offset, 2)}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>{body}</tbody>
                </table>
            </div>
        </div>
    );
}

/** Stands in for `rows` rows that are not rendered, keeping the scroll height. */
function spacer(firstRow: number, rows: number, rowHeight: number, bytesPerRow: number) {
    return (
        <tr key={`spacer-${firstRow}`} data-memory-spacer="" aria-hidden="true" style={{ height: rows * rowHeight }}>
            <td colSpan={bytesPerRow + 1} className="p-0" />
        </tr>
    );
}

export default MemoryTable;
