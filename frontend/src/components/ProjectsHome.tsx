"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
    Boxes,
    Cpu,
    FolderKanban,
    Plus,
    Search,
    Sparkles,
    type LucideIcon,
} from "lucide-react";

import Project from "@/components/Project";
import { SyncStatusNotice } from "@/components/SyncStatusNotice";
import { ARCHITECTURES, type Architecture } from "@/lib/api/contract";
import { describeApiError } from "@/lib/api/errors";
import type { ProjectSync, SyncStatus } from "@/lib/projects/ProjectSync";
import { getProjectSync } from "@/lib/projects/projectSyncInstance";
import type { Project as ProjectData } from "@/lib/simulator/Project";

export type ProjectsHomeProps = {
    /** Defaults to the page-wide instance; tests pass their own. */
    sync?: ProjectSync;
};

const NO_PROJECTS: ProjectData[] = [];
const IDLE: SyncStatus = { state: "idle" };

/** Projects stored in this browser, mirrored to the server session. */
export function ProjectsHome({ sync: injected }: ProjectsHomeProps) {
    const router = useRouter();

    // The page-wide instance touches browser storage, so it is only looked up
    // on the client (subscribe/getSnapshot never run during server rendering).
    const getSync = useCallback(() => injected ?? getProjectSync(), [injected]);

    const projects = useSyncExternalStore(
        useCallback((onChange) => getSync().subscribeProjects(onChange), [getSync]),
        () => getSync().projectsSnapshot(),
        () => NO_PROJECTS,
    );
    const status = useSyncExternalStore(
        useCallback((onChange) => getSync().subscribe(onChange), [getSync]),
        () => getSync().getStatus(),
        () => IDLE,
    );

    const [query, setQuery] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [architecture, setArchitecture] = useState<Architecture>("SIC-XE");
    // What this server can run; null until known (or if it cannot be asked).
    const [runnable, setRunnable] = useState<Architecture[] | null>(null);

    useEffect(() => {
        void getSync().start();
    }, [getSync]);

    useEffect(() => {
        let cancelled = false;
        getSync()
            .availableArchitectures()
            .then((list) => {
                if (!cancelled) setRunnable(list);
            })
            .catch(() => undefined); // every documented architecture stays on offer, unmarked
        return () => {
            cancelled = true;
        };
    }, [getSync]);

    const filteredProjects = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return [...projects]
            .filter((project) => !normalized ||
                `${project.name} ${project.architecture} ${Object.keys(project.files).join(" ")}`
                    .toLowerCase()
                    .includes(normalized))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [projects, query]);

    const totalFiles = projects.reduce((total, project) => total + Object.keys(project.files).length, 0);
    const architectureCount = new Set(projects.map((project) => project.architecture)).size;

    const openCreateDialog = () => {
        setName("");
        setFormError(null);
        setCreateOpen(true);
    };

    const create = (event: FormEvent) => {
        event.preventDefault();
        try {
            const { project } = getSync().createProject({ name: name.trim(), architecture });
            setFormError(null);
            setName("");
            setCreateOpen(false);
            router.push(`/editor/${project.id}/`);
        } catch (error) {
            setFormError(describeApiError(error).message);
        }
    };

    const remove = (project: ProjectData) => {
        if (!window.confirm(`Delete the project "${project.name}" and all of its files?`)) return;
        void getSync().deleteProject(project.id);
    };

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute -top-48 left-1/3 h-[34rem] w-[34rem] rounded-full bg-blue-500/[0.08] blur-[120px]" />
                <div className="absolute -right-48 top-[28rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/[0.06] blur-[120px]" />
            </div>

            <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 sm:px-8">
                <nav className="flex h-[76px] items-center justify-between border-b border-white/[0.07]" aria-label="Main navigation">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-300">
                            <Cpu size={18} />
                        </div>
                        <div>
                            <div className="text-sm font-semibold tracking-wide">SIC/XE Studio</div>
                            <div className="text-[11px] text-zinc-500">Architecture simulator</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Workspace
                    </div>
                </nav>

                <div className="mt-4 overflow-hidden rounded-lg empty:hidden">
                    <SyncStatusNotice status={status} />
                </div>

                <section className="flex-1 py-12 sm:py-16">
                    <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
                        <div>
                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/15 bg-blue-400/[0.07] px-3 py-1.5 text-xs font-medium text-blue-200">
                                <Sparkles size={13} /> Project workspace
                            </div>
                            <p className="mb-2 text-sm text-zinc-500">Your workspace <span className="px-1 text-zinc-700">/</span> Projects</p>
                            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Projects</h1>
                            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                                Organize your assembly programs and open a project to continue working in the simulator.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={openCreateDialog}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 focus:ring-offset-zinc-950"
                        >
                            <Plus size={17} /> New project
                        </button>
                    </div>

                    <div className="mt-10 grid gap-3 sm:grid-cols-3">
                        <SummaryCard icon={FolderKanban} label="Projects" value={projects.length.toString().padStart(2, "0")} />
                        <SummaryCard icon={Cpu} label="Architectures in use" value={architectureCount.toString().padStart(2, "0")} />
                        <SummaryCard icon={Boxes} label="Source files" value={totalFiles.toString().padStart(2, "0")} />
                    </div>

                    <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">All projects</h2>
                            <p className="mt-1 text-sm text-zinc-500">Browse and manage your simulator workspaces.</p>
                        </div>
                        <label className="relative block w-full sm:max-w-xs">
                            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search projects or files"
                                aria-label="Search projects or files"
                                className="h-10 w-full rounded-xl border border-white/[0.09] bg-zinc-900/80 pl-10 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/10"
                            />
                        </label>
                    </div>

                    {filteredProjects.length > 0 ? (
                        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {filteredProjects.map((project) => (
                                <Project
                                    key={project.id}
                                    id={project.id}
                                    title={project.name}
                                    architecture={project.architecture}
                                    fileTree={Object.keys(project.files).sort()}
                                    onDelete={() => remove(project)}
                                />
                            ))}
                        </div>
                    ) : projects.length > 0 ? (
                        <div className="mt-6 rounded-2xl border border-dashed border-white/[0.12] px-6 py-14 text-center">
                            <Search className="mx-auto text-zinc-600" size={22} />
                            <h3 className="mt-4 font-medium">No matching projects</h3>
                            <p className="mt-1 text-sm text-zinc-500">Try another project, architecture, or file name.</p>
                        </div>
                    ) : (
                        <div className="mt-6 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.015] px-6 py-16 text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-zinc-400">
                                <FolderKanban size={24} />
                            </div>
                            <h3 className="mt-5 text-base font-semibold">Start your first project</h3>
                            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                                Create a workspace, add assembly files, and run them in the simulator.
                            </p>
                            <button type="button" onClick={openCreateDialog} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10">
                                <Plus size={15} /> Create your first project
                            </button>
                        </div>
                    )}
                </section>

                <footer className="flex h-14 items-center justify-between border-t border-white/[0.07] text-xs text-zinc-600">
                    <span>SIC/XE Studio</span>
                    <span>Projects are stored in this browser and synced to the server</span>
                </footer>
            </div>

            {createOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                    <section role="dialog" aria-modal="true" aria-labelledby="create-project-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
                        <h2 id="create-project-title" className="text-lg font-semibold">Create a project</h2>
                        <p className="mt-1 text-sm text-zinc-500">Choose a name and target architecture for this workspace.</p>
                        <form onSubmit={create} className="mt-6 space-y-4">
                            <label className="block text-sm font-medium text-zinc-300">
                                Project name
                                <input autoFocus value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 text-sm outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/10" placeholder="e.g. String utilities" />
                            </label>
                            <label className="block text-sm font-medium text-zinc-300">
                                Architecture
                                <select value={architecture} onChange={(event) => setArchitecture(event.target.value as Architecture)} required className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 text-sm outline-none focus:border-blue-400/50">
                                    {ARCHITECTURES.map((value) => (
                                        <option key={value} value={value}>
                                            {runnable && !runnable.includes(value) ? `${value} (not available on this server)` : value}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {formError && <p className="text-xs text-red-300">{formError}</p>}
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg px-3.5 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100">Cancel</button>
                                <button type="submit" disabled={!name.trim()} className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50">
                                    Create project
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}
        </main>
    );
}

function SummaryCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
    return (
        <div className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-zinc-400"><Icon size={18} /></div>
            <div>
                <div className="text-2xl font-semibold tracking-tight">{value}</div>
                <div className="text-xs text-zinc-500">{label}</div>
            </div>
        </div>
    );
}

export default ProjectsHome;
