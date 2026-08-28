import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { ATMN_DIR } from "./workspacePaths.ts";

const run = promisify(execFile);

/**
 * The agent's config imports from "atmn", whose entrypoint lives in dist/ —
 * build it once if missing so workspace symlinks resolve. node:child_process
 * because the braintrust CLI executes this bundle under node, not bun.
 */
export const ensureAtmnBuilt = async (): Promise<void> => {
	if (existsSync(join(ATMN_DIR, "dist/compose/index.js"))) return;
	await run("bun", ["run", "build"], { cwd: ATMN_DIR });
};
