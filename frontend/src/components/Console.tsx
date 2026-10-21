"use client";

import { useEffect, useRef } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as TerminalIcon } from "lucide-react";
import type { ExecutionEvent } from "@/lib/simulator/ExecutionEvent";
import "@xterm/xterm/css/xterm.css";

// ============================================================
// Types
// ============================================================

export type ConsoleHandle = {
    /** Write raw text (with \r\n line endings) to the terminal. */
    write: (text: string) => void;
    /** Write one styled status line. */
    log: (text: string, level?: "info" | "success" | "warning" | "error") => void;
    /** Render simulator events as a readable execution trace. */
    writeEvents: (events: ExecutionEvent[]) => void;
    /** Clear the terminal screen. */
    clear: () => void;
};

function hex(value: number, width = 0): string {
    return Math.max(0, value).toString(16).toUpperCase().padStart(width, "0");
}

function bytesText(bytes: number[]): string {
    return bytes.map((byte) => hex(byte, 2)).join(" ");
}

function eventLines(event: ExecutionEvent): { text: string; level: "info" | "success" | "warning" }[] {
    switch (event.type) {
        case "ProgramAssembled":
            return [{ text: `Assembly complete · ${event.details.symbols.length} symbols`, level: "success" }];
        case "InstructionFetched":
            return [{
                text: `${event.preview ? "Next" : "Fetch"}  0x${hex(event.address, 5)}  ${bytesText(event.bytes)}`,
                level: "info",
            }];
        case "InstructionExecuted":
            return event.instruction
                ? [{ text: `Execute  ${event.instruction.mnemonic}`, level: "success" }]
                : [];
        case "RegisterWrite":
            return [{
                text: `${event.name.padEnd(3)}  0x${hex(event.old_value)} → 0x${hex(event.value)}`,
                level: "info",
            }];
        case "MemoryWrite":
            return [{
                text: `MEM[0x${hex(event.address, 5)}]  ${bytesText(event.old_bytes)} → ${bytesText(event.bytes)}`,
                level: "info",
            }];
        case "MemoryCleared":
            return [{ text: "Memory cleared", level: "warning" }];
        case "ProgramCleared":
            return [{ text: "Assembly state cleared", level: "warning" }];
        case "InstructionDecoded":
        case "RegisterRead":
        case "MemoryRead":
            return [];
    }
}

function attachHandle(terminal: XTerminal): ConsoleHandle {
    const colors = {
        info: "\x1b[38;5;110m",
        success: "\x1b[38;5;114m",
        warning: "\x1b[38;5;221m",
        error: "\x1b[38;5;203m",
    };
    return {
        write: (text) => terminal.write(text),
        log: (text, level = "info") => {
            const marker = level === "success" ? "✓" : level === "error" ? "✗" : level === "warning" ? "!" : "›";
            terminal.write(`${colors[level]}${marker}\x1b[0m  ${text}\r\n`);
        },
        writeEvents: (events) => {
            for (const event of events) {
                for (const line of eventLines(event)) {
                    const color = line.level === "success"
                        ? colors.success
                        : line.level === "warning"
                            ? colors.warning
                            : colors.info;
                    terminal.write(`${color}│\x1b[0m  ${line.text}\r\n`);
                }
            }
        },
        clear: () => terminal.clear(),
    };
}

export type ConsoleProps = {
    /**
     * Called whenever the user submits a command (presses Enter with a
     * non-empty buffer). The Console does not know what any command does —
     * the caller decides, and writes output back via the exposed handle.
     */
    onCommand?: (command: string, handle: ConsoleHandle) => void;
    /** Text printed once when the terminal first mounts. */
    banner?: string;
    /** Label shown in the panel header. Defaults to "Terminal". */
    label?: string;
    /** Ref to imperatively write/clear the terminal from a parent. */
    handleRef?: React.MutableRefObject<ConsoleHandle | null>;
};

// ============================================================
// Console
// ============================================================

export function Console({
    onCommand,
    banner = "SIC/XE STUDIO\r\nCPU simulator · session ready\r\nType 'help' for commands.\r\n",
    label = "Terminal",
    handleRef,
}: ConsoleProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<XTerminal | null>(null);
    const commandBufferRef = useRef("");
    const onCommandRef = useRef(onCommand);

    useEffect(() => {
        onCommandRef.current = onCommand;
    }, [onCommand]);

    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const terminal = new XTerminal({
            cursorBlink: true,
            cursorStyle: "bar",
            fontSize: 13,
            lineHeight: 1.25,
            scrollback: 2000,
            fontFamily:
                "JetBrains Mono, Cascadia Code, Consolas, monospace",
            theme: {
                background: "#101216",
                foreground: "#D5D9E0",
                cursor: "#7DD3FC",
                selectionBackground: "#334155",
                black: "#101216",
                red: "#F87171",
                green: "#86EFAC",
                yellow: "#FDE68A",
                blue: "#93C5FD",
                magenta: "#C4B5FD",
                cyan: "#67E8F9",
                white: "#E2E8F0",
                brightBlack: "#64748B",
                brightRed: "#FCA5A5",
                brightGreen: "#BBF7D0",
                brightYellow: "#FEF3C7",
                brightBlue: "#BFDBFE",
                brightMagenta: "#DDD6FE",
                brightCyan: "#A5F3FC",
                brightWhite: "#FFFFFF",
            },
        });

        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(containerRef.current);
        fit.fit();

        const bannerLines = banner.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
        terminal.write(`\x1b[1;38;5;117m${bannerLines[0]}\x1b[0m\r\n`);
        bannerLines.slice(1).forEach((line) => terminal.write(`\x1b[38;5;245m${line}\x1b[0m\r\n`));
        terminal.write("\r\n\x1b[38;5;75msicxe\x1b[38;5;245m › \x1b[0m");

        terminalRef.current = terminal;

        if (handleRef) {
            handleRef.current = attachHandle(terminal);
        }

        const resizeObserver = new ResizeObserver(() => {
            fit.fit();
        });
        resizeObserver.observe(containerRef.current);

        const disposable = terminal.onData((data) => {
            // Enter
            if (data === "\r") {
                const command = commandBufferRef.current.trim();
                terminal.write("\r\n");

                if (command.length > 0) {
                    onCommandRef.current?.(command, {
                        ...attachHandle(terminal),
                    });
                }

                commandBufferRef.current = "";
                terminal.write("\r\n\x1b[38;5;75msicxe\x1b[38;5;245m › \x1b[0m");
                return;
            }

            // Backspace
            if (data === "\u007f") {
                if (commandBufferRef.current.length > 0) {
                    commandBufferRef.current =
                        commandBufferRef.current.slice(0, -1);
                    terminal.write("\b \b");
                }
                return;
            }

            // Printable characters
            if (data >= " " && data <= "~") {
                commandBufferRef.current += data;
                terminal.write(data);
            }
        });

        return () => {
            disposable.dispose();
            resizeObserver.disconnect();
            terminal.dispose();
            terminalRef.current = null;

            if (handleRef) {
                handleRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <section
                className="flex h-full flex-col border-t border-white/[0.07] bg-[#101216]"
        >
            <div
                className="
                    h-10
                    shrink-0
                    px-3
                    flex
                    items-center
                    gap-2
                    border-b
                    border-white/[0.07]
                    text-[11px]
                    text-zinc-400
                "
            >
                <TerminalIcon size={14} />
                <span className="font-semibold tracking-[0.14em] text-zinc-300">{label.toUpperCase()}</span>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-emerald-300/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                    READY
                </span>
            </div>

            <div ref={containerRef} className="min-h-0 flex-1 px-3 py-2" />
        </section>
    );
}

export default Console;
