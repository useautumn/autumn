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
	withStripe = false,
}: {
	runId: string;
	/** mint + bind a sandbox Stripe sub-account (needed for paid attach/checkout) */
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
	/** attach a Stripe test payment method (needed before seeding paid plans) */
	paymentMethod?: boolean;
	/** billing.attach bodies (customer_id is filled in) */
	attach?: Record<string, unknown>[];
	/** licenses.attach entities (customer_id is filled in) */
	licenseAssignments?: Record<string, unknown>[];
	/** /track bodies run after attaches (customer_id is filled in) */
	track?: Record<string, unknown>[];
};

/** Seed an "existing subscriber" state into the run org before the agent
 * starts — create customer, add test payment method, run attach calls. */
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
