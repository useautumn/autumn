import { cp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CaseWorkspace } from "./types/caseWorkspace.ts";
import { ATMN_DIR, REPO_ROOT, WORKSPACE_ROOT } from "./workspacePaths.ts";

const AUTUMN_JS_DIR = join(REPO_ROOT, "packages/autumn-js");
const FIXTURES_DIR = join(REPO_ROOT, "packages/ax-evals/fixtures");

/**
 * A throwaway copy of a fixture app for integration cases. The agent edits
 * the copy; `autumn-js` (and its deps) resolve via symlinks like a real npm
 * install — zero bytes copied, no network.
 */
export const createFixtureWorkspace = async ({
	label,
	fixture,
	secretKey,
}: {
	label: string;
	fixture: "notes-api";
	secretKey: string;
}): Promise<CaseWorkspace> => {
	const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	const dir = join(WORKSPACE_ROOT, `${label}-${runId}`);
	await cp(join(FIXTURES_DIR, fixture), dir, { recursive: true });
	await mkdir(join(dir, "node_modules"), { recursive: true });
	await symlink(AUTUMN_JS_DIR, join(dir, "node_modules/autumn-js"));
	// atmn resolves too: the catalog seed imports it in autumn.config.ts.
	await symlink(ATMN_DIR, join(dir, "node_modules/atmn"));
	await writeFile(join(dir, ".env"), `AUTUMN_SECRET_KEY=${secretKey}\n`);

	const cleanup = async () => {
		if (process.env.AX_EVALS_KEEP === "1") {
			process.stderr.write(`[ax-evals] kept workspace: ${dir}\n`);
			return;
		}
		await rm(dir, { recursive: true, force: true });
	};

	return { dir, cleanup };
};
