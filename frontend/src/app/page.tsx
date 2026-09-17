"use client";

import { useRouter } from "next/navigation";

import Project from "@/components/Project";
import { Project as TypeProject } from "@/lib/simulator/Project";
import { Simulator } from "@/lib/simulator/Simulator";
import { useEffect, useState } from "react";

export default function SimulatorTest() {
    const router = useRouter();

    const [projects, setProjects] = useState<Array<TypeProject>>([])
    const [architectures, setArchitectures] = useState<Array<String>>([])
    let simulator: Simulator | null = null;

    useEffect(
        () => {
            simulator = Simulator.get();

            simulator.projects().then((projects) => {
                setProjects(projects);
            })
        }
        , [])

    return (
        <div className="flex flex-col w-screen h-screen">
            <div className="bg-zinc-500 w-full h-32">
            </div>
            <div className="flex w-full flex-grow">
                <div className="bg-zinc-700 h-full w-64">
                </div>
                <div className="flex flex-col flex-grow">
                    {projects && projects.map((project) => (
                        <Project key={project.id} id={project.id} title={project.name} architecture={project.architecture} fileTree={Object.keys(project.files)} />
                    ))}
                </div>
            </div>
            <div className="bg-zinc-400 w-full h-8">

            </div>
        </div>
    );
}