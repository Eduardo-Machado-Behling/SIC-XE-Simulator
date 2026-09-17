import { SimulatorTransport } from "@/lib/transport/SimulatorTransport";
import { WebTransport } from "@/lib/transport/WebTransport";
import { Project } from "@/lib/simulator/Project";

export class Simulator {
    public static get(): Simulator {
        if (!this.instance) {
            this.instance = new Simulator();
        }

        return this.instance
    }

    public async step(): Promise<unknown> {
        return this.transport!.step();
    }
    public async reset(): Promise<unknown> {
        return this.transport!.reset();
    }

    public async projects(): Promise<Project[]> {
        return this.transport!.projects();
    }

    public async createProject(newProject: Project): Promise<unknown> {
        return this.transport!.createProject(newProject);
    }

    public async loadProject(projectId: string): Promise<Project> {
        return this.transport!.loadProject(projectId);
    }

    public loadFile(file: string): Promise<unknown> {
        return this.transport!.loadFile(file)
    }

    private constructor() {
        if (this.is_web()) {
            this.transport = new WebTransport(this.get_url());
            this.transport.connect();
        }
    }

    //TODO: temp
    private is_web() {
        return true;
    }

    private get_url() {
        return "localhost:8080";
    }


    private static instance: Simulator | null = null;
    private transport: SimulatorTransport | null = null;
};