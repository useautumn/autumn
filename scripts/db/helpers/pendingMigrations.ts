import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { JOURNAL_PATH, MIGRATIONS_DIR } from "./paths.ts";

export type JournalEntry = {
	idx: number;
	version: string;
	when: number;
	tag: string;
	breakpoints: boolean;
};

export type PendingMigration = JournalEntry & {
	sql: string;
	sqlPath: string;
	/** Unrecorded, but older than the newest recorded migration: drizzle-kit's filter skips it. */
	outOfOrder: boolean;
};

/**
 * Returns journal migrations not recorded in drizzle.__drizzle_migrations. drizzle-kit only
 * applies entries newer than the largest recorded `created_at`; older gaps are `outOfOrder`.
 */
export async function getPendingMigrations(
	client: pg.Client,
): Promise<PendingMigration[]> {
	await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
	await client.query(`
		CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)
	`);

	const result = await client.query<{ created_at: string }>(
		`SELECT created_at FROM "drizzle"."__drizzle_migrations" WHERE created_at IS NOT NULL`,
	);
	const recorded = new Set(result.rows.map((row) => Number(row.created_at)));
	const lastApplied = recorded.size > 0 ? Math.max(...recorded) : null;

	const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as {
		entries: JournalEntry[];
	};

	return journal.entries
		.filter((entry) => !recorded.has(entry.when))
		.map((entry) => {
			const sqlPath = join(MIGRATIONS_DIR, `${entry.tag}.sql`);
			const sql = readFileSync(sqlPath, "utf8");
			const outOfOrder = lastApplied !== null && entry.when <= lastApplied;
			return { ...entry, sql, sqlPath, outOfOrder };
		});
}

/** Local DBs (twd workers, docker) are built from zero by this tool, so every applied migration has a row. */
export function isLocalDatabase(databaseUrl: string): boolean {
	try {
		const { hostname } = new URL(databaseUrl);
		return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
	} catch {
		return false;
	}
}
