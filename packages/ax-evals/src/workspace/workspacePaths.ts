import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const WORKSPACE_ROOT = join(tmpdir(), "autumn-ax-evals");
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

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
