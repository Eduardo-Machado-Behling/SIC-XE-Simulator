"use client";

import type { ReactNode } from "react";

// ============================================================
// PanelSection
// ============================================================

// A titled view that fills its panel; the body scrolls inside it. Same header
// as SymbolTable, so the Assembler tab's sub-views read as one set.
export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section aria-label={title} className="flex h-full min-h-0 w-full flex-col bg-zinc-900">
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
                {title}
            </div>
            {children}
        </section>
    );
}

export function PanelScroll({ children }: { children: ReactNode }) {
    return <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">{children}</div>;
}

// What a view says instead of its content when it has none.
export function PanelMessage({ children }: { children: ReactNode }) {
    return (
        <p role="status" className="px-3 text-xs text-zinc-500">
            {children}
        </p>
    );
}

export default PanelSection;
