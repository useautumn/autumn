import { log, fatal, sh } from "../helpers/shell.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { loadRegistry } from "../helpers/registry.ts";
import { assertNotProductionDb } from "../../../server/src/db/dbUtils.ts";

const UPDATE_SQL = `UPDATE "user" SET role = 'admin';`;

function describeTarget(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return "(unparseable connection string)";
	}
}

// Sets the better-auth global role to 'admin' for every user in the current
// worktree's DB, which grants the superuser scope locally. Org membership
// roles (the `member` table) are intentionally left untouched.
export function cmdMakeAdmin(): void {
	const cwd = getCurrentWorktree();
	const entry = loadRegistry()[cwd];
	const url = entry?.databaseUrl || process.env.DATABASE_URL || "";
	if (!url) {
		fatal("no DATABASE_URL for this worktree — run 'bun dw setup' first");
	}

	try {
		assertNotProductionDb(url);
	} catch (err) {
		fatal(err instanceof Error ? err.message : String(err));
	}

	log(`making all users admin on ${describeTarget(url)}`);
	const res = sh("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", UPDATE_SQL]);
	if (res.code !== 0) {
		fatal(`psql failed: ${res.stderr || res.stdout}`);
	}
	log(res.stdout || "done");
}
