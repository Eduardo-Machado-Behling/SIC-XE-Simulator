"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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
    const nameId = useId();
    const archId = useId();

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

    const [formError, setFormError] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [architecture, setArchitecture] = useState<Architecture>("SIC-XE");

    useEffect(() => {
        void getSync().start();
    }, [getSync]);

    const create = (event: FormEvent) => {
        event.preventDefault();
        try {
            const { project } = getSync().createProject({ name: name.trim(), architecture });
            setFormError(null);
            setName("");
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
        <div className="flex flex-col w-screen h-screen">
            <div className="bg-zinc-500 w-full h-32">
            </div>
            <SyncStatusNotice status={status} />
            <div className="flex w-full flex-grow min-h-0">
                <div className="bg-zinc-700 h-full w-64 p-3 text-sm text-zinc-100">
                    <form onSubmit={create} className="flex flex-col gap-2">
                        <label htmlFor={nameId} className="text-xs text-zinc-300">Project name</label>
                        <input
                            id={nameId}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="rounded bg-zinc-900 px-2 py-1"
                        />
                        <label htmlFor={archId} className="text-xs text-zinc-300">Architecture</label>
                        <select
                            id={archId}
                            value={architecture}
                            onChange={(event) => setArchitecture(event.target.value as Architecture)}
                            className="rounded bg-zinc-900 px-2 py-1"
                        >
                            {ARCHITECTURES.map((value) => (
                                <option key={value} value={value}>{value}</option>
                            ))}
                        </select>
                        <button type="submit" className="rounded bg-blue-600 px-2 py-1 hover:bg-blue-500">
                            Create project
                        </button>
                        {formError && <p className="text-xs text-red-300">{formError}</p>}
                    </form>
                </div>
                <div className="flex flex-col flex-grow gap-2 overflow-auto p-3">
                    {projects.map((project) => (
                        <Project
                            key={project.id}
                            id={project.id}
                            title={project.name}
                            architecture={project.architecture}
                            fileTree={Object.keys(project.files)}
                            onDelete={() => remove(project)}
                        />
                    ))}
                </div>
            </div>
            <div className="bg-zinc-400 w-full h-8">

            </div>
        </div>
    );
}

export default ProjectsHome;
