import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { linkAtmn } from "./linkAtmn.ts";
import type { CaseWorkspace } from "./types/caseWorkspace.ts";
import { WORKSPACE_ROOT } from "./workspacePaths.ts";

/**
 * One throwaway directory per run under WORKSPACE_ROOT, deleted by cleanup()
 * in the task's finally block. "atmn" resolves via a symlink — zero bytes
 * copied. AX_EVALS_KEEP=1 keeps a workspace for debugging.
 */
export const createCaseWorkspace = async (
	label: string,
	{
		secretKey,
		backendUrl,
	}: {
		secretKey: string;
		backendUrl: string;
	},
): Promise<CaseWorkspace> => {
	const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	const dir = join(WORKSPACE_ROOT, `${label}-${runId}`);
	await mkdir(dir, { recursive: true });
	await linkAtmn({ dir, backendUrl });
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
