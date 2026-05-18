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
};

/**
 * Returns migrations on disk that haven't been recorded in drizzle.__drizzle_migrations yet.
 * Mirrors drizzle-kit's filter: anything in _journal.json whose `when` is greater than the
 * largest `created_at` already in the tracking table.
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

	const result = await client.query<{ created_at: string | null }>(
		`SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
	);
	const lastApplied =
		result.rowCount && result.rowCount > 0 && result.rows[0].created_at !== null
			? Number(result.rows[0].created_at)
			: null;

	const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as {
		entries: JournalEntry[];
	};

	return journal.entries
		.filter((entry) => lastApplied === null || entry.when > lastApplied)
		.map((entry) => {
			const sqlPath = join(MIGRATIONS_DIR, `${entry.tag}.sql`);
			const sql = readFileSync(sqlPath, "utf8");
			return { ...entry, sql, sqlPath };
		});
}
