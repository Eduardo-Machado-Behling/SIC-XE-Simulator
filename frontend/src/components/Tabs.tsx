"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// ============================================================
// Types
// ============================================================

export type TabDefinition = {
    id: string;
    label: string;
    content: ReactNode;
};

export type TabsProps = {
    tabs: TabDefinition[];
    label: string;
    defaultTabId?: string;
};

// ============================================================
// Tabs
// ============================================================

// Accessible tabs (WAI-ARIA tabs pattern). Every panel stays mounted and the
// inactive ones are hidden, so a view keeps its state, such as its scroll
// position, while another tab is shown.
export function Tabs({ tabs, label, defaultTabId }: TabsProps) {
    const baseId = useId();
    const [selectedId, setSelectedId] = useState(defaultTabId ?? tabs[0]?.id);
    const tabRefs = useRef(new Map<string, HTMLButtonElement>());

    const tabId = (id: string) => `${baseId}-tab-${id}`;
    const panelId = (id: string) => `${baseId}-panel-${id}`;

    const select = (id: string, focus: boolean) => {
        setSelectedId(id);
        if (focus) tabRefs.current.get(id)?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const current = tabs.findIndex((tab) => tab.id === selectedId);
        let next: number;

        switch (event.key) {
            case "ArrowRight":
                next = (current + 1) % tabs.length;
                break;
            case "ArrowLeft":
                next = (current - 1 + tabs.length) % tabs.length;
                break;
            case "Home":
                next = 0;
                break;
            case "End":
                next = tabs.length - 1;
                break;
            default:
                return;
        }

        event.preventDefault();
        select(tabs[next].id, true);
    };

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <div
                role="tablist"
                aria-label={label}
                onKeyDown={onKeyDown}
                className="
                    flex
                    h-9
                    shrink-0
                    items-end
                    gap-1
                    border-b
                    border-zinc-800
                    bg-zinc-900
                    px-2
                "
            >
                {tabs.map((tab) => {
                    const selected = tab.id === selectedId;

                    return (
                        <button
                            key={tab.id}
                            ref={(element) => {
                                if (element) tabRefs.current.set(tab.id, element);
                                else tabRefs.current.delete(tab.id);
                            }}
                            type="button"
                            role="tab"
                            id={tabId(tab.id)}
                            aria-selected={selected}
                            aria-controls={panelId(tab.id)}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => select(tab.id, false)}
                            className={`
                                -mb-px
                                border-b-2
                                px-3
                                py-1.5
                                text-xs
                                font-semibold
                                uppercase
                                tracking-wide
                                transition-colors
                                focus-visible:outline
                                focus-visible:outline-blue-500
                                ${selected
                                    ? "border-blue-500 text-zinc-100"
                                    : "border-transparent text-zinc-400 hover:text-zinc-200"}
                            `}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {tabs.map((tab) => {
                const selected = tab.id === selectedId;

                return (
                    <div
                        key={tab.id}
                        role="tabpanel"
                        id={panelId(tab.id)}
                        aria-labelledby={tabId(tab.id)}
                        hidden={!selected}
                        className={selected ? "flex min-h-0 flex-1 flex-col" : undefined}
                    >
                        {tab.content}
                    </div>
                );
            })}
        </div>
    );
}

export default Tabs;
