// orval.config.ts
//
// `npm run api:generate` (also run by `dev` and `build`) writes an orval fetch
// client and models to src/api/generated for reference. The app does not
// import them: src/lib/api holds the hand-written client the frontend uses,
// and src/lib/api/openapi.contract.test.ts checks that client against the
// same document.

import { defineConfig } from "orval";

export default defineConfig({
	api: {
		input: {
			// The specification lives at the repository root, next to frontend/.
			target: "../api_spec/openapi.yaml",
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
