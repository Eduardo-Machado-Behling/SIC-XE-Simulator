// orval.config.ts

import { defineConfig } from "orval";

export default defineConfig({
	api: {
		input: {
			target: "./api/openapi.yaml",
		},

		output: {
			mode: "tags-split",

			target: "./src/api/generated/api.ts",

			schemas: "./src/api/generated/models",

			client: "fetch",

			baseUrl: {
				runtime: "process.env.NEXT_PUBLIC_BACKEND_URL",
			}
		},
	},
});
