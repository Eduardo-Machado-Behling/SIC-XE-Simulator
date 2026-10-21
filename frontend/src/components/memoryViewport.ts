// Viewport arithmetic for the memory table. Pure functions, so the centring,
// the clamping at both ends of the address space and the windowing can be
// tested without a layout engine.
//
// Positions are in "row space": 0 is the top of address 0's row and
// rowCount * rowHeight is the bottom of the last row. The scroll container's
// scrollTop maps onto it directly, because the column header is sticky and
// covers the top of the container instead of pushing the rows down.

/** Half-open range of row indexes, [start, end). */
export type RowRange = { start: number; end: number };

/** Number of rows needed to show `addressSpaceSize` bytes, the last one possibly partial. */
export function rowCount(addressSpaceSize: number, bytesPerRow: number): number {
    if (addressSpaceSize <= 0 || bytesPerRow <= 0) return 0;
    return Math.ceil(addressSpaceSize / bytesPerRow);
}

export function isValidAddress(address: number, addressSpaceSize: number): boolean {
    return Number.isInteger(address) && address >= 0 && address < addressSpaceSize;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export type CenteredScrollTopInput = {
    pcAddress: number | undefined;
    addressSpaceSize: number;
    bytesPerRow: number;
    rowHeight: number;
    /** Height available to the rows, without the column header. */
    viewportHeight: number;
};

/**
 * scrollTop that puts the PC row in the middle of the viewport, clamped so the
 * first row never moves below the top and the last row never rises above the
 * bottom. null when the PC is not a valid address, so there is nothing to show.
 */
export function centeredScrollTop({
    pcAddress,
    addressSpaceSize,
    bytesPerRow,
    rowHeight,
    viewportHeight,
}: CenteredScrollTopInput): number | null {
    if (pcAddress === undefined || !isValidAddress(pcAddress, addressSpaceSize)) return null;

    const pcRow = Math.floor(pcAddress / bytesPerRow);
    const ideal = pcRow * rowHeight + rowHeight / 2 - viewportHeight / 2;
    const max = Math.max(0, rowCount(addressSpaceSize, bytesPerRow) * rowHeight - viewportHeight);

    return clamp(Math.round(ideal), 0, max);
}

export type RowRangeInput = {
    scrollTop: number;
    rowHeight: number;
    viewportHeight: number;
    totalRows: number;
    /** Extra rows rendered above and below the visible ones. */
    overscan: number;
};

/** Rows to render for a scroll position: the visible ones plus the overscan. */
export function rowRange({ scrollTop, rowHeight, viewportHeight, totalRows, overscan }: RowRangeInput): RowRange {
    if (totalRows <= 0 || rowHeight <= 0) return { start: 0, end: 0 };

    const start = clamp(Math.floor(scrollTop / rowHeight) - overscan, 0, totalRows);
    const end = clamp(Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan, start, totalRows);

    return { start, end };
}

/** Sorted, disjoint ranges covering the same rows; touching ranges are joined. */
export function mergeRowRanges(ranges: RowRange[]): RowRange[] {
    const sorted = ranges
        .filter((range) => range.end > range.start)
        .sort((a, b) => a.start - b.start);

    const merged: RowRange[] = [];
    for (const range of sorted) {
        const last = merged[merged.length - 1];
        if (last && range.start <= last.end) {
            last.end = Math.max(last.end, range.end);
        } else {
            merged.push({ ...range });
        }
    }

    return merged;
}

/**
 * Write marks after an execution update: address -> revision of the update
 * that last wrote it. Bytes written by this update get `revision`; bytes of
 * the previous update keep their mark so an effect still playing can finish;
 * anything older is dropped, which keeps the map at most two updates large.
 */
export function nextWriteMarks(
    previous: ReadonlyMap<number, number>,
    previousRevision: number,
    changedAddresses: readonly number[],
    revision: number,
    addressSpaceSize: number,
): Map<number, number> {
    const marks = new Map<number, number>();

    for (const [address, markRevision] of previous) {
        if (markRevision === previousRevision) marks.set(address, markRevision);
    }

    for (const address of changedAddresses) {
        if (isValidAddress(address, addressSpaceSize)) marks.set(address, revision);
    }

    return marks;
}
