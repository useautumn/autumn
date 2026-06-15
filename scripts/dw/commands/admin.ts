import { assertNotProductionDb } from "../../../server/src/db/dbUtils.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { loadRegistry } from "../helpers/registry.ts";
import { fatal, log, sh } from "../helpers/shell.ts";

const UPDATE_SQL = `UPDATE "user" SET role = 'admin';`;

function describeTarget(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return "(unparseable connection string)";
	}
}

// Sets the better-auth global role to 'admin' for every user in the given DB,
// which grants the superuser scope locally. Org membership roles (the `member`
// table) are intentionally left untouched. Throws (rather than exiting) so
// callers like `bun dw setup` can treat a failure as non-fatal.
export function promoteAllUsersToAdmin(url: string): void {
	assertNotProductionDb(url);
	log(`making all users admin on ${describeTarget(url)}`);
	const res = sh("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", UPDATE_SQL]);
	if (res.code !== 0) {
		throw new Error(`psql failed: ${res.stderr || res.stdout}`);
	}
	log(res.stdout || "done");
}

export function cmdAdmin(): void {
	const cwd = getCurrentWorktree();
	const entry = loadRegistry()[cwd];
	const url = entry?.databaseUrl || process.env.DATABASE_URL || "";
	if (!url) {
		fatal("no DATABASE_URL for this worktree — run 'bun dw setup' first");
	}

	try {
		promoteAllUsersToAdmin(url);
	} catch (err) {
		fatal(err instanceof Error ? err.message : String(err));
	}
}
