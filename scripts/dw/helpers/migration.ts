import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sh, shInherit, fatal, log } from "./shell.ts";
import { PROJECT_ROOT } from "../constants.ts";

/**
 * Brings a freshly-provisioned Neon branch up to the canonical schema.
 *
 * Strategy: invoke the shared `bun db migrate --bootstrap` CLI with the new
 * branch's DATABASE_URL injected directly (bypassing infisical). `--bootstrap`
 * skips the index-DDL safety check, which is safe here because the DB is empty
 * and has no concurrent traffic.
 */
export function applyCommittedMigrations(
	branchName: string,
	databaseUrl: string,
): void {
	log(`applying committed migrations to ${branchName} (this may take a few minutes)`);

	const code = shInherit("bun", ["db", "migrate", "--bootstrap"], {
		cwd: PROJECT_ROOT,
		env: {
			...(process.env as Record<string, string>),
			DATABASE_URL: databaseUrl,
			AUTUMN_DB_DIRECT: "1",
		},
	});

	if (code !== 0) {
		fatal(`bun db migrate --bootstrap failed for ${branchName} (exit ${code})`);
	}
}

export function loadDbFunctions(branchName: string, databaseUrl: string): void {
	log(`loading DB functions into ${branchName}`);
	const sqlDir = join(
		PROJECT_ROOT,
		"server",
		"src",
		"internal",
		"balances",
		"utils",
		"sql",
	);
	const sqlFiles = [
		"deductFromRollovers.sql",
		"deductFromMainBalance.sql",
		"unwindFromLockReceipt.sql",
		"getTotalBalance.sql",
		"deductFromAdditionalBalance.sql",
		"getAvailableOverageFromSpendLimit.sql",
		"performDeduction.sql",
		"syncBalances.sql",
		"syncBalancesV2.sql",
		"resetCusEnts.sql",
	];
	for (const f of sqlFiles) {
		const p = join(sqlDir, f);
		const sqlBody = readFileSync(p, "utf-8");
		const res = sh("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1"], {
			stdin: sqlBody,
		});
		if (res.code !== 0) {
			fatal(
				`loading DB function ${f} into ${branchName} failed:\n${res.stdout}\n${res.stderr}`,
			);
		}
	}
}
