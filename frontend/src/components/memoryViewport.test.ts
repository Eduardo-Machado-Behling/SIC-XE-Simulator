import { describe, expect, it } from "vitest";

import {
    centeredScrollTop,
    isValidAddress,
    mergeRowRanges,
    nextWriteMarks,
    rowCount,
    rowRange,
} from "@/components/memoryViewport";

// Every expected value below is worked out by hand in the comment next to it.

describe("rowCount", () => {
    it("counts whole rows", () => {
        expect(rowCount(1024, 16)).toBe(64); // 1024 / 16
        expect(rowCount(1 << 20, 16)).toBe(65536); // 2^20 / 2^4
        expect(rowCount(1024, 8)).toBe(128);
    });

    it("counts a final partial row", () => {
        expect(rowCount(1000, 16)).toBe(63); // 62 full rows (992 bytes) + 8 bytes
        expect(rowCount(1, 16)).toBe(1);
        expect(rowCount(17, 16)).toBe(2);
    });

    it("has no rows for an empty or invalid space", () => {
        expect(rowCount(0, 16)).toBe(0);
        expect(rowCount(-16, 16)).toBe(0);
        expect(rowCount(1024, 0)).toBe(0);
    });
});

describe("isValidAddress", () => {
    it("accepts every integer address from 0 to size - 1", () => {
        expect(isValidAddress(0, 1024)).toBe(true);
        expect(isValidAddress(1023, 1024)).toBe(true);
    });

    it("rejects addresses outside the space and non-integers", () => {
        expect(isValidAddress(1024, 1024)).toBe(false);
        expect(isValidAddress(-1, 1024)).toBe(false);
        expect(isValidAddress(1.5, 1024)).toBe(false);
        expect(isValidAddress(Number.NaN, 1024)).toBe(false);
        expect(isValidAddress(0, 0)).toBe(false);
    });
});

describe("centeredScrollTop", () => {
    // 1 KiB, 16 bytes a row: 64 rows of 30px = 1920px of rows.
    // A 300px viewport shows 10 rows, so the largest scrollTop is 1920 - 300 = 1620.
    const base = { addressSpaceSize: 1024, bytesPerRow: 16, rowHeight: 30, viewportHeight: 300 };

    it("centres the PC row when there is room above and below", () => {
        // 0x200 = 512 is row 32: its middle is at 32 * 30 + 15 = 975, minus half the viewport (150).
        expect(centeredScrollTop({ ...base, pcAddress: 0x200 })).toBe(825);
        // Any byte of the row gives the same position: 0x20F is still row 32.
        expect(centeredScrollTop({ ...base, pcAddress: 0x20F })).toBe(825);
        // 0x50 = 80 is row 5: 150 + 15 - 150 = 15, the first position that centres it.
        expect(centeredScrollTop({ ...base, pcAddress: 0x50 })).toBe(15);
        // Row 58 (0x3A0): 1740 + 15 - 150 = 1605, still below the 1620 limit.
        expect(centeredScrollTop({ ...base, pcAddress: 0x3A0 })).toBe(1605);
    });

    it("keeps address 0 as the top row near the start", () => {
        expect(centeredScrollTop({ ...base, pcAddress: 0 })).toBe(0); // 0 + 15 - 150 < 0
        expect(centeredScrollTop({ ...base, pcAddress: 0x40 })).toBe(0); // row 4: 120 + 15 - 150 = -15
    });

    it("keeps the last row at the bottom near the end", () => {
        expect(centeredScrollTop({ ...base, pcAddress: 1023 })).toBe(1620); // row 63: 1755 > 1620
        expect(centeredScrollTop({ ...base, pcAddress: 0x3B0 })).toBe(1620); // row 59: 1635 > 1620
    });

    it("never scrolls when every row fits in the viewport", () => {
        // 64 bytes = 4 rows = 120px, shorter than the 300px viewport.
        expect(centeredScrollTop({ ...base, addressSpaceSize: 64, pcAddress: 63 })).toBe(0);
    });

    it("uses the last valid row when the size is not a multiple of the row width", () => {
        // 1000 bytes = 63 rows = 1890px, so the limit is 1890 - 300 = 1590; 999 is in row 62.
        expect(centeredScrollTop({ ...base, addressSpaceSize: 1000, pcAddress: 999 })).toBe(1590);
    });

    it("follows the viewport height", () => {
        // 600px: 960 + 15 - 300 = 675.
        expect(centeredScrollTop({ ...base, viewportHeight: 600, pcAddress: 0x200 })).toBe(675);
        // 301px: 975 - 150.5 = 824.5, rounded to a whole pixel.
        expect(centeredScrollTop({ ...base, viewportHeight: 301, pcAddress: 0x200 })).toBe(825);
    });

    it("follows the row width and the address space size", () => {
        // 8 bytes a row: 512 is row 64, 64 * 30 + 15 - 150 = 1785 (limit 128 * 30 - 300 = 3540).
        expect(centeredScrollTop({ ...base, bytesPerRow: 8, pcAddress: 512 })).toBe(1785);
        // 1 MiB: 0x80000 is row 32768, 32768 * 30 + 15 - 150 = 982905.
        expect(centeredScrollTop({ ...base, addressSpaceSize: 1 << 20, pcAddress: 0x80000 })).toBe(982905);
        // ... and its last address 0xFFFFF sits on the bottom row: 65536 * 30 - 300 = 1965780.
        expect(centeredScrollTop({ ...base, addressSpaceSize: 1 << 20, pcAddress: 0xFFFFF })).toBe(1965780);
    });

    it("has no position for a PC outside the address space", () => {
        expect(centeredScrollTop({ ...base, pcAddress: 1024 })).toBeNull();
        expect(centeredScrollTop({ ...base, pcAddress: -1 })).toBeNull();
        expect(centeredScrollTop({ ...base, pcAddress: undefined })).toBeNull();
    });
});

describe("rowRange", () => {
    const base = { rowHeight: 30, viewportHeight: 300, totalRows: 64, overscan: 2 };

    it("covers the visible rows plus the overscan on both sides", () => {
        // 825 / 30 = 27.5 -> first visible row 27; (825 + 300) / 30 = 37.5 -> up to row 37.
        expect(rowRange({ ...base, scrollTop: 825 })).toEqual({ start: 25, end: 40 });
    });

    it("stops at the first row", () => {
        expect(rowRange({ ...base, scrollTop: 0 })).toEqual({ start: 0, end: 12 });
    });

    it("stops at the last row", () => {
        // 1620 / 30 = 54; (1620 + 300) / 30 = 64, the row count.
        expect(rowRange({ ...base, scrollTop: 1620 })).toEqual({ start: 52, end: 64 });
    });

    it("renders only the overscan for an unmeasured viewport", () => {
        expect(rowRange({ ...base, viewportHeight: 0, scrollTop: 0 })).toEqual({ start: 0, end: 2 });
    });

    it("is empty without rows", () => {
        expect(rowRange({ ...base, totalRows: 0, scrollTop: 0 })).toEqual({ start: 0, end: 0 });
    });
});

describe("mergeRowRanges", () => {
    it("keeps disjoint ranges apart, in order", () => {
        expect(mergeRowRanges([{ start: 25, end: 40 }, { start: 0, end: 12 }])).toEqual([
            { start: 0, end: 12 },
            { start: 25, end: 40 },
        ]);
    });

    it("joins overlapping and touching ranges", () => {
        expect(mergeRowRanges([{ start: 0, end: 12 }, { start: 10, end: 20 }])).toEqual([{ start: 0, end: 20 }]);
        expect(mergeRowRanges([{ start: 0, end: 12 }, { start: 12, end: 20 }])).toEqual([{ start: 0, end: 20 }]);
        expect(mergeRowRanges([{ start: 5, end: 8 }, { start: 0, end: 20 }])).toEqual([{ start: 0, end: 20 }]);
    });

    it("drops empty ranges", () => {
        expect(mergeRowRanges([{ start: 3, end: 3 }, { start: 0, end: 2 }])).toEqual([{ start: 0, end: 2 }]);
        expect(mergeRowRanges([])).toEqual([]);
    });
});

describe("nextWriteMarks", () => {
    it("marks every written byte with the new revision", () => {
        const marks = nextWriteMarks(new Map(), 0, [0x10, 0x11, 0x12], 1, 1024);

        expect([...marks].sort(([a], [b]) => a - b)).toEqual([[0x10, 1], [0x11, 1], [0x12, 1]]);
    });

    it("re-marks a byte written again, keeps the previous update's other bytes and drops older ones", () => {
        // Byte 7 was written two updates ago (revision 2); bytes 1 and 2 in the last one (revision 3).
        const previous = new Map([[1, 3], [2, 3], [7, 2]]);

        const marks = nextWriteMarks(previous, 3, [2, 5], 4, 1024);

        expect([...marks].sort(([a], [b]) => a - b)).toEqual([[1, 3], [2, 4], [5, 4]]);
    });

    it("ignores writes outside the address space", () => {
        const marks = nextWriteMarks(new Map(), 0, [1023, 1024, -1], 1, 1024);

        expect([...marks]).toEqual([[1023, 1]]);
    });

    it("does not change the previous marks", () => {
        const previous = new Map([[1, 3]]);

        nextWriteMarks(previous, 3, [1], 4, 1024);

        expect([...previous]).toEqual([[1, 3]]);
    });
});
