import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Every eval workspace lives under this single root and is deleted in the
 * task's finally block. Nothing is ever written into the repo or scattered
 * across the machine; sweepStaleWorkspaces removes anything a crashed run
 * left behind.
 */
export const WORKSPACE_ROOT = join(tmpdir(), "autumn-ax-evals");
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Marker-walk instead of import.meta: the braintrust CLI bundles to CJS.
const findRepoRoot = (): string => {
	let dir = process.cwd();
	while (!existsSync(join(dir, "bun.lock"))) {
		const parent = dirname(dir);
		if (parent === dir)
			throw new Error(`No bun.lock found above ${process.cwd()}`);
		dir = parent;
	}
	return dir;
};

export const REPO_ROOT = findRepoRoot();
export const ATMN_DIR = join(REPO_ROOT, "packages/atmn");
export const AX_EVALS_DIR = join(REPO_ROOT, "packages/ax-evals");
