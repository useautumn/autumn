import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "../constants.js";

const MAIN_GUARD = "if (import.meta.main)";

/** Source of a built-ins-only script to run as `bun -e` in a sandbox without the repo;
 * `bun -e` sets import.meta.main=false, so the main guard is forced on. */
export const readInlineBunScript = (repoRelativePath: string): string => {
	const scriptPath = join(PROJECT_ROOT, repoRelativePath);
	const source = readFileSync(scriptPath, "utf8");
	if (!source.includes(MAIN_GUARD)) {
		throw new Error(`main guard not found in ${scriptPath}`);
	}
	return source.replace(MAIN_GUARD, "if (true)");
};
