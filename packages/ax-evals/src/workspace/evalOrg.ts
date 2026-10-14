import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { AX_EVALS_DIR } from "./workspacePaths.ts";

const run = promisify(execFile);

const REPO_ROOT = join(AX_EVALS_DIR, "../..");
const EVAL_ORG_SCRIPT = join(REPO_ROOT, "scripts/setupTestUtils/evalOrg.ts");
const EVAL_CUSTOMER_SCRIPT = join(
	REPO_ROOT,
	"scripts/setupTestUtils/evalCustomer.ts",
);

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

export const createEvalOrg = async ({
	runId,
	withStripe = false,
}: {
	runId: string;
	withStripe?: boolean;
}): Promise<EvalOrg> => {
	const { stdout } = await run(
		"bun",
		[EVAL_ORG_SCRIPT, "create", runId, ...(withStripe ? ["--stripe"] : [])],
		{
			cwd: REPO_ROOT,
			env: scriptEnv(),
		},
	);
	const lastLine = stdout.trim().split("\n").at(-1) ?? "";
	return JSON.parse(lastLine) as EvalOrg;
};

export type SeedCustomerSpec = {
	customer: { id: string; name?: string; email?: string };
	paymentMethod?: boolean;
	attach?: Record<string, unknown>[];
	licenseAssignments?: Record<string, unknown>[];
	track?: Record<string, unknown>[];
};

export const seedEvalCustomer = async ({
	org,
	backendUrl,
	seed,
}: {
	org: EvalOrg;
	backendUrl: string;
	seed: SeedCustomerSpec;
}): Promise<void> => {
	await run(
		"bun",
		[
			EVAL_CUSTOMER_SCRIPT,
			JSON.stringify({
				backendUrl,
				secretKey: org.secretKey,
				orgId: org.orgId,
				...seed,
			}),
		],
		{ cwd: REPO_ROOT, env: scriptEnv() },
	);
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
