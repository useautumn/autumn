import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
	project: "proj_cwiutfmpdzfcshxevkok",
	runtime: "bun",
	dirs: ["./tasks"],
	maxDuration: 60,
	retries: { enabledInDev: true },
	build: { external: ["pg", "ioredis"] },
});
