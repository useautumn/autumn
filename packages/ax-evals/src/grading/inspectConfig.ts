import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { AX_EVALS_DIR } from "../workspace/workspacePaths.ts";
import type { InspectedConfig } from "./types/inspectedConfig.ts";

const run = promisify(execFile);

const INSPECT_SCRIPT = join(
	AX_EVALS_DIR,
	"src/grading/inspectWorkspaceConfigScript.ts",
);

/**
 * Spawns the inspection as a bun subprocess: atmn internals (jiti,
 * import.meta) never enter the braintrust CLI's CJS eval bundle, and this
 * wrapper itself runs fine under node.
 */
export const inspectWorkspaceConfig = async (
	workspaceDir: string,
): Promise<InspectedConfig> => {
	const empty: InspectedConfig = {
		configFound: false,
		plans: [],
		features: [],
	};
	if (!existsSync(join(workspaceDir, "autumn.config.ts"))) return empty;

	try {
		const { stdout } = await run("bun", [INSPECT_SCRIPT, workspaceDir]);
		return JSON.parse(stdout);
	} catch (error) {
		return {
			...empty,
			configFound: true,
			parseError: error instanceof Error ? error.message : String(error),
		};
	}
};
