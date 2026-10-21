import { SimulatorApiClient } from "@/lib/api/SimulatorApiClient";
import { resolveBackendUrl } from "@/lib/api/config";
import { LocalProjectStore } from "@/lib/projects/LocalProjectStore";
import { ProjectSync } from "@/lib/projects/ProjectSync";
import { createCookieSessionStore } from "@/lib/session/sessionCookie";

let instance: ProjectSync | null = null;

/**
 * The page-wide ProjectSync. Call it from effects or event handlers only (not
 * during render), so nothing browser-specific runs on the server.
 */
export function getProjectSync(): ProjectSync {
    if (!instance) {
        instance = new ProjectSync({
            api: new SimulatorApiClient({ baseUrl: resolveBackendUrl() }),
            store: new LocalProjectStore(),
            session: createCookieSessionStore(),
        });
    }
    return instance;
}
