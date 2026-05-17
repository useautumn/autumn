import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sh, fatal, log } from "./shell.ts";
import { SHARED_DIR, PROJECT_ROOT } from "../constants.ts";

export function listSqlFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((f) => f.endsWith(".sql"));
}

export function writeTempDrizzleConfig(outDir: string): string {
	const tmp = join(SHARED_DIR, `.dw-${process.pid}.config.ts`);
	const content = `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({\n\tdialect: "postgresql",\n\tout: ${JSON.stringify(outDir)},\n\tschema: "./db/schema.ts",\n\tdbCredentials: { url: process.env.DATABASE_URL! },\n});\n`;
	writeFileSync(tmp, content);
	return tmp;
}

export function generateAndApplyMigration(
	branchName: string,
	databaseUrl: string,
): void {
	// Use the worktree's own shared/drizzle/ as the migration dir (matches
	// drizzle.config.ts out: "./drizzle"). Empty it first so the baseline
	// generated for this fresh Neon branch isn't a diff against the canonical
	// repo's migration history — subsequent `bun db:generate` runs then emit
	// clean incrementals against this worktree's actual DB state.
	const outDir = join(SHARED_DIR, "drizzle");
	if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });

	const drizzleConfigPath = writeTempDrizzleConfig(outDir);
	try {
		log(`generating initial migration for ${branchName}`);
		const gen = sh(
			"bunx",
			["drizzle-kit", "generate", "--config", drizzleConfigPath],
			{
				cwd: SHARED_DIR,
				env: {
					...(process.env as Record<string, string>),
					NODE_OPTIONS: "--import tsx",
				},
			},
		);
		if (gen.code !== 0) {
			fatal(`drizzle-kit generate failed:\n${gen.stdout}\n${gen.stderr}`);
		}

		const sqlFiles = listSqlFiles(outDir);
		if (sqlFiles.length === 0) {
			fatal(`no .sql files generated in ${outDir}`);
		}

		log(`applying ${sqlFiles.length} migration file(s) to ${branchName}`);
		for (const f of sqlFiles) {
			const p = join(outDir, f);
			const sqlBody = readFileSync(p, "utf-8");
			const mig = sh("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1"], {
				stdin: sqlBody,
			});
			if (mig.code !== 0) {
				fatal(
					`applying migration ${f} failed:\n${mig.stdout}\n${mig.stderr}`,
				);
			}
		}
	} finally {
		if (existsSync(drizzleConfigPath)) rmSync(drizzleConfigPath);
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
