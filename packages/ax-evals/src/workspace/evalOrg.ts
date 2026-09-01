import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { AX_EVALS_DIR } from "./workspacePaths.ts";

const run = promisify(execFile);

const REPO_ROOT = join(AX_EVALS_DIR, "../..");
const EVAL_ORG_SCRIPT = join(REPO_ROOT, "scripts/setupTestUtils/evalOrg.ts");

/** The DATABASE_URL `bun dw` wrote for this worktree — the same DB the
 * running server is on. Infisical's DATABASE_URL is a different Neon branch,
 * so evalOrg must not inherit it. */
const worktreeDatabaseUrl = (): string | undefined => {
	try {
		const envLocal = readFileSync(join(REPO_ROOT, "server/.env.local"), "utf8");
		return envLocal.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
	} catch {
		return undefined;
	}
};

const scriptEnv = (): NodeJS.ProcessEnv => {
	const databaseUrl = worktreeDatabaseUrl();
	return {
		...process.env,
		...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
	};
};

export type EvalOrg = { orgId: string; secretKey: string };

/**
 * One throwaway org per eval run, provisioned via the server-side script
 * (which owns the DB deps and the prod-DB guard).
 */
export const createEvalOrg = async ({
	runId,
}: {
	runId: string;
}): Promise<EvalOrg> => {
	const { stdout } = await run("bun", [EVAL_ORG_SCRIPT, "create", runId], {
		cwd: REPO_ROOT,
		env: scriptEnv(),
	});
	const lastLine = stdout.trim().split("\n").at(-1) ?? "";
	return JSON.parse(lastLine) as EvalOrg;
};

export const deleteEvalOrg = async ({
	runId,
}: {
	runId: string;
}): Promise<void> => {
	await run("bun", [EVAL_ORG_SCRIPT, "delete", runId], {
		cwd: REPO_ROOT,
		env: scriptEnv(),
	});
};
