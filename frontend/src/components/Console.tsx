"use client";

import { useEffect, useRef } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as TerminalIcon } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

// ============================================================
// Types
// ============================================================

export type ConsoleHandle = {
    /** Write raw text (with \r\n line endings) to the terminal. */
    write: (text: string) => void;
    /** Clear the terminal screen. */
    clear: () => void;
};

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
    banner = "SIC-XE Simulator\r\nType 'help' for available commands.\r\n",
    label = "Terminal",
    handleRef,
}: ConsoleProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<XTerminal | null>(null);
    const commandBufferRef = useRef("");

    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const terminal = new XTerminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily:
                "JetBrains Mono, Cascadia Code, Consolas, monospace",
            theme: {
                background: "#18181b",
            },
        });

        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(containerRef.current);
        fit.fit();

        // Write banner (first line highlighted, rest plain) then a prompt.
        const bannerLines = banner.split("\r\n");
        terminal.write(`\x1b[1;32m${bannerLines[0]}\x1b[0m\r\n`);
        bannerLines.slice(1).forEach((line) => terminal.write(`${line}\r\n`));
        terminal.write("\r\n> ");

        terminalRef.current = terminal;

        if (handleRef) {
            handleRef.current = {
                write: (text: string) => terminal.write(text),
                clear: () => terminal.clear(),
            };
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
                    onCommand?.(command, {
                        write: (text: string) => terminal.write(text),
                        clear: () => terminal.clear(),
                    });
                }

                commandBufferRef.current = "";
                terminal.write("\r\n> ");
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
            className="
                h-full
                flex
                flex-col
                bg-zinc-900
            "
        >
            <div
                className="
                    h-9
                    shrink-0
                    px-3
                    flex
                    items-center
                    gap-2
                    border-b
                    border-zinc-800
                    text-xs
                    text-zinc-400
                "
            >
                <TerminalIcon size={14} />
                {label.toUpperCase()}
            </div>

            <div ref={containerRef} className="flex-1 min-h-0 p-2" />
        </section>
    );
}

export default Console;
