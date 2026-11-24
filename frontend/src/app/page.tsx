"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Cpu, Plus, Search } from "lucide-react";

import { ErrorModal } from "@/components/ErrorModal";
import Project from "@/components/Project";
import { LanguageSwitch, useT, type MessageKey } from "@/lib/i18n";
import { Project as TypeProject } from "@/lib/simulator/Project";
import { Simulator } from "@/lib/simulator/Simulator";
import { readStoredProjects, saveStoredProjects, syncProjectsToSession } from "@/lib/simulator/ProjectSessionSync";
import { defaultProjectFiles } from "@/lib/simulator/defaultProjectFiles";

// Keys, not text: the message must follow a language switch made after the error.
type PageError = { title: MessageKey; detail: string | null; fallback: MessageKey };

export default function ProjectsPage() {
    const router = useRouter();
    const t = useT();
    const simulator = Simulator.get();
    const [projects, setProjects] = useState<TypeProject[]>([]);
    const [architectures, setArchitectures] = useState<string[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [projectName, setProjectName] = useState("");
    const [architecture, setArchitecture] = useState("");
    const [error, setError] = useState<PageError | null>(null);

    useEffect(() => {
        let cancelled = false;

        Promise.all([simulator.architectures(), Promise.resolve(readStoredProjects())])
            .then(async ([items, stored]) => {
                let localProjects = stored;
                if (localProjects.length === 0 && items.length > 0) {
                    const preferred = items.find((item) => item.toLowerCase().replace(/[^a-z0-9]/g, "") === "sicxe") ?? items[0];
                    localProjects = [{
                        id: crypto.randomUUID(),
                        name: "SIC/XE Syntax Tour",
                        architecture: preferred,
                        files: defaultProjectFiles(),
                    }];
                    saveStoredProjects(localProjects);
                }
                await syncProjectsToSession(localProjects);
                if (!cancelled) {
                    setProjects(localProjects);
                    setArchitectures(items.sort((a, b) => a.localeCompare(b)));
                }
            })
            .catch((reason: unknown) => {
                if (!cancelled) {
                    setError({
                        title: "projects.loadFailed",
                        detail: reason instanceof Error ? reason.message : null,
                        fallback: "projects.loadFailedDetail",
                    });
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [simulator]);

    const filteredProjects = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return [...projects]
            .filter((project) => !normalized ||
                `${project.name} ${project.architecture} ${Object.keys(project.files).join(" ")}`
                    .toLowerCase()
                    .includes(normalized))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [projects, query]);

    const openCreateDialog = () => {
        if (architectures.length === 0) {
            setError({ title: "projects.noArch", detail: null, fallback: "projects.noArchDetail" });
            return;
        }
        setProjectName("");
        setArchitecture(architectures[0]);
        setCreateOpen(true);
    };

    const createProject = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const name = projectName.trim();
        if (!name || !architecture) return;

        const project: TypeProject = {
            id: crypto.randomUUID(),
            name,
            architecture,
            files: defaultProjectFiles(),
        };

        setCreating(true);
        try {
            const updated = [...projects, project];
            saveStoredProjects(updated);
            await syncProjectsToSession(updated);
            setProjects(updated);
            setCreateOpen(false);
            router.push(`/editor/${project.id}/`);
        } catch (reason) {
            setError({
                title: "projects.createFailed",
                detail: reason instanceof Error ? reason.message : null,
                fallback: "projects.createFailedDetail",
            });
        } finally {
            setCreating(false);
        }
    };

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8">
                <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 py-5">
                    <div className="flex items-center gap-3">
                        <Cpu size={20} className="text-blue-400" aria-hidden="true" />
                        <div>
                            <p className="text-sm font-semibold">{t("app.name")}</p>
                            <p className="text-xs text-zinc-400">{t("app.tagline")}</p>
                        </div>
                    </div>
                    <LanguageSwitch />
                </header>

                <section aria-labelledby="projects-heading" className="flex-1 py-10">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <h1 id="projects-heading" className="text-3xl font-semibold">{t("projects.heading")}</h1>
                        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                            <label className="relative block min-w-0 flex-1 sm:w-72 sm:flex-none">
                                <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder={t("projects.search")}
                                    aria-label={t("projects.search")}
                                    className={`${FIELD} pl-9 pr-3`}
                                />
                            </label>
                            <button type="button" onClick={openCreateDialog} className={PRIMARY_BUTTON}>
                                <Plus size={16} aria-hidden="true" /> {t("projects.new")}
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div role="status" aria-label={t("projects.loading")} className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {Array.from({ length: 3 }, (_, index) => (
                                <div key={index} className="h-24 animate-pulse rounded-lg bg-zinc-900 motion-reduce:animate-none" />
                            ))}
                        </div>
                    ) : filteredProjects.length > 0 ? (
                        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {filteredProjects.map((project) => (
                                <Project
                                    key={project.id}
                                    id={project.id}
                                    title={project.name}
                                    architecture={project.architecture}
                                    fileTree={Object.keys(project.files).sort()}
                                />
                            ))}
                        </div>
                    ) : projects.length > 0 ? (
                        <div className="mt-6 rounded-lg border border-dashed border-zinc-700 px-6 py-12 text-center">
                            <h2 className="font-medium">{t("projects.noMatch")}</h2>
                            <p className="mt-1 text-sm text-zinc-400">{t("projects.noMatchHint")}</p>
                        </div>
                    ) : (
                        <div className="mt-6 rounded-lg border border-dashed border-zinc-700 px-6 py-12 text-center">
                            <h2 className="font-semibold">{t("projects.empty")}</h2>
                            <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">{t("projects.emptyHint")}</p>
                            <button type="button" onClick={openCreateDialog} className={`${PRIMARY_BUTTON} mt-5`}>
                                <Plus size={16} aria-hidden="true" /> {t("projects.create")}
                            </button>
                        </div>
                    )}
                </section>

                <footer className="border-t border-zinc-800 py-4 text-xs text-zinc-400">
                    {t("projects.storage")}
                </footer>
            </div>

            {createOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                    onKeyDown={(event) => {
                        if (event.key === "Escape") setCreateOpen(false);
                    }}
                >
                    <section role="dialog" aria-modal="true" aria-labelledby="create-project-title" className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6">
                        <h2 id="create-project-title" className="text-lg font-semibold">{t("projects.dialogTitle")}</h2>
                        <form onSubmit={createProject} className="mt-5 space-y-4">
                            <label className="block text-sm font-medium text-zinc-200">
                                {t("projects.name")}
                                <input autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} required maxLength={80} className={`${FIELD} mt-2 px-3`} placeholder={t("projects.namePlaceholder")} />
                            </label>
                            <label className="block text-sm font-medium text-zinc-200">
                                {t("projects.architecture")}
                                <select value={architecture} onChange={(event) => setArchitecture(event.target.value)} required className={`${FIELD} mt-2 px-3`}>
                                    {architectures.map((item) => <option key={item} value={item}>{item}</option>)}
                                </select>
                            </label>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg px-3.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-400">
                                    {t("projects.cancel")}
                                </button>
                                <button type="submit" disabled={creating || !projectName.trim()} className={PRIMARY_BUTTON}>
                                    {creating ? t("projects.creating") : t("projects.create")}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {error && (
                <ErrorModal title={t(error.title)} detail={error.detail ?? t(error.fallback)} onClose={() => setError(null)} />
            )}
        </main>
    );
}

const PRIMARY_BUTTON = "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50";
const FIELD = "h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-zinc-100 placeholder:text-zinc-400 focus-visible:border-blue-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400";
