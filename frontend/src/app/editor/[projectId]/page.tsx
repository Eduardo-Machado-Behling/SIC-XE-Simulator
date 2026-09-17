import EditorPage from "@/components/EditorPage";

import { Project } from "@/lib/simulator/Project";
import { Simulator } from "@/lib/simulator/Simulator";

interface PageProps {
    params: Promise<{
        projectId: string;
    }>;
}

export default async function Page({
    params,
}: PageProps) {
    const { projectId } = await params;

    return (
        <EditorPage projectId={projectId}></EditorPage>
    )
}