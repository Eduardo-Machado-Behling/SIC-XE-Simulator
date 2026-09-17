
"use client";

import { ArchitectureInfo } from "@/lib/simulator/ArchitectureInfo";
import { useEffect, useRef, useState } from "react";

export interface ArchProps {
    arch: ArchitectureInfo | null
}

export function ExecutionView({ arch }: ArchProps) {
    if (!arch)
        return (
            <aside
                className="
                h-full
                bg-zinc-900
                border-r
                border-zinc-800
                flex
                flex-col
            "
            >
            </aside>
        );

    return (
        <aside
            className="
                h-full
                bg-zinc-900
                border-r
                border-zinc-800
                flex
                flex-col
            "
        >

        </aside>
    );
}

