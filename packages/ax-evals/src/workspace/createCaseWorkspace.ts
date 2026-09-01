import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureAtmnBuilt } from "./ensureAtmnBuilt.ts";
import type { CaseWorkspace } from "./types/caseWorkspace.ts";
import { ATMN_DIR, WORKSPACE_ROOT } from "./workspacePaths.ts";

/**
 * One throwaway directory per run under WORKSPACE_ROOT, deleted by cleanup()
 * in the task's finally block. "atmn" resolves via a symlink — zero bytes
 * copied. AX_EVALS_KEEP=1 keeps a workspace for debugging.
 */
export const createCaseWorkspace = async (
	label: string,
	{ secretKey }: { secretKey: string },
): Promise<CaseWorkspace> => {
	await ensureAtmnBuilt();
	const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	const dir = join(WORKSPACE_ROOT, `${label}-${runId}`);
	await mkdir(join(dir, "node_modules/.bin"), { recursive: true });
	await symlink(ATMN_DIR, join(dir, "node_modules/atmn"));
	// The .bin shim npm would have installed — `atmn` and `npx atmn` both
	// resolve through it.
	await symlink(
		join(ATMN_DIR, "dist/cli.js"),
		join(dir, "node_modules/.bin/atmn"),
	);
	// atmn declared as a dependency and a secret key in .env, so agents see an
	// already-installed, already-authenticated project; install/login behavior
	// is exercised by dedicated setup-flow cases instead.
	await writeFile(
		join(dir, "package.json"),
		JSON.stringify(
			{
				name: "ax-eval-workspace",
				type: "module",
				dependencies: { atmn: "*" },
			},
			null,
			"\t",
		),
	);
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
