import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { AX_EVALS_DIR } from "./workspacePaths.ts";

const run = promisify(execFile);

const REPO_ROOT = join(AX_EVALS_DIR, "../..");
const EVAL_ORG_SCRIPT = join(REPO_ROOT, "scripts/setupTestUtils/evalOrg.ts");

export type EvalOrg = { orgId: string; secretKey: string };

/**
 * One throwaway org per eval run, provisioned via the server-side script
 * (which owns the DB deps and the prod-DB guard). Runs as a bun subprocess
 * from the repo root so preload-env wires the worktree DATABASE_URL.
 */
export const createEvalOrg = async ({
	runId,
}: {
	runId: string;
}): Promise<EvalOrg> => {
	const { stdout } = await run("bun", [EVAL_ORG_SCRIPT, "create", runId], {
		cwd: REPO_ROOT,
	});
	const lastLine = stdout.trim().split("\n").at(-1) ?? "";
	return JSON.parse(lastLine) as EvalOrg;
};

export const deleteEvalOrg = async ({
	runId,
}: {
	runId: string;
}): Promise<void> => {
	await run("bun", [EVAL_ORG_SCRIPT, "delete", runId], { cwd: REPO_ROOT });
};
