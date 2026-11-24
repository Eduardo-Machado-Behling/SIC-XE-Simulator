"use client";

import { AlertTriangle, X } from "lucide-react";
import { useT } from "@/lib/i18n";

type ErrorModalProps = {
    title: string;
    detail: string;
    onClose: () => void;
};

export function ErrorModal({ title, detail, onClose }: ErrorModalProps) {
    const t = useT();
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="simulator-error-title"
                aria-describedby="simulator-error-detail"
                className="w-full max-w-md rounded-2xl border border-red-900/70 bg-zinc-950 p-6 text-zinc-100 shadow-2xl shadow-black/50"
            >
                <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-900/70 bg-red-950/60 text-red-300">
                        <AlertTriangle size={20} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 id="simulator-error-title" className="text-base font-semibold tracking-tight">
                            {title}
                        </h2>
                        <p id="simulator-error-detail" className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                            {detail}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t("error.close")}
                        className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-red-400"
                    >
                        <X size={17} aria-hidden="true" />
                    </button>
                </div>
                <div className="mt-6 flex justify-end">
                    <button
                        type="button"
                        autoFocus
                        onClick={onClose}
                        className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
                    >
                        {t("error.dismiss")}
                    </button>
                </div>
            </section>
        </div>
    );
}
