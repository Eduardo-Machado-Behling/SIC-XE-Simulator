import type { Dispatch, SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RegisterState } from "@/components/RegisterTable";
import { normalizeExecutionEvents } from "@/lib/simulator/ExecutionEvent";
import { Simulator } from "@/lib/simulator/Simulator";

// The simulator opens a WebSocket on creation; this fake transport records
// the commands instead.
const transport = vi.hoisted(() => ({
    connect: vi.fn(),
    send: vi.fn(),
}));

vi.mock("@/lib/transport/WebTransport", () => ({
    WebTransport: class {
        connect = transport.connect;
        async clearMemory() {
            return normalizeExecutionEvents(await transport.send("clear"));
        }
    },
}));

// Runs resolve() against plain values, as React would apply the updaters.
function resolve(events: unknown[], memory: Map<number, number>, registers: RegisterState[] = []) {
    const state = { memory, registers };
    const setMemory: Dispatch<SetStateAction<Map<number, number>>> = (update) => {
        state.memory = typeof update === "function" ? update(state.memory) : update;
    };
    const setRegisters: Dispatch<SetStateAction<RegisterState[]>> = (update) => {
        state.registers = typeof update === "function" ? update(state.registers) : update;
    };
    Simulator.get().resolve(normalizeExecutionEvents(events), setMemory, setRegisters);
    return state;
}

const write = (address: number, value: number[]) => ({
    type: "MemoryWrite", address, value, old_value: value.map(() => 0),
});

describe("Simulator.resolve", () => {
    beforeEach(() => {
        transport.send.mockReset();
    });

    it("empties the memory on MemoryCleared", () => {
        const { memory } = resolve([{ type: "MemoryCleared" }], new Map([[0, 0xAB], [0x1000, 0x01]]));

        expect([...memory]).toEqual([]);
    });

    it("applies the batch in order: writes after a clear stay, bytes before it go", () => {
        const previous = new Map([[0x1000, 0x11], [0x1001, 0x22], [0x2000, 0x33]]);

        const { memory } = resolve([
            write(0x1000, [0xAA]),          // overwritten by the clear below
            { type: "MemoryCleared" },
            write(0x1001, [0x01, 0x00, 0x05]),
        ], previous);

        expect([...memory].sort(([a], [b]) => a - b)).toEqual([[0x1001, 0x01], [0x1002, 0x00], [0x1003, 0x05]]);
    });

    it("does not change the registers on MemoryCleared", () => {
        const registers = [{ id: 1, name: "A", value: 5 }, { id: 8, name: "PC", value: 0x1003 }];

        const state = resolve([{ type: "MemoryCleared" }], new Map([[0, 1]]), registers);

        expect(state.registers).toEqual(registers);
    });

    it("does not mutate the previous memory map", () => {
        const previous = new Map([[0, 0xAB]]);

        resolve([{ type: "MemoryCleared" }], previous);

        expect([...previous]).toEqual([[0, 0xAB]]);
    });
});

describe("Simulator.clearMemory", () => {
    it("sends 'clear' and returns the normalized events", async () => {
        transport.send.mockResolvedValueOnce([{ type: "MemoryCleared" }]);

        await expect(Simulator.get().clearMemory()).resolves.toEqual([{ type: "MemoryCleared" }]);
        expect(transport.send).toHaveBeenCalledWith("clear");
    });
});
