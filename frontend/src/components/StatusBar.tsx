"use client";

export type StatusBarProps = {
    left: string;
    activeFile: string;
    encoding?: string;
    language?: string;
};

export function StatusBar({
    left,
    activeFile,
    encoding = "UTF-8",
    language = "Assembly",
}: StatusBarProps) {
    return (
        <footer
            className="
                h-6
                shrink-0
                bg-blue-600
                flex
                items-center
                px-3
                text-[11px]
                text-white
            "
        >
            <span>{left}</span>
            <span className="mx-3">|</span>
            <span>{activeFile}</span>

            <div className="flex-1" />

            <span>{encoding}</span>
            <span className="mx-3">|</span>
            <span>{language}</span>
        </footer>
    );
}

export default StatusBar;
