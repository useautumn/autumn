import type { MigrationMeta } from "drizzle-orm/migrator";
import type pg from "pg";

// CONCURRENTLY (e.g. CREATE INDEX CONCURRENTLY) cannot run inside a transaction
// block. drizzle's own migrate() wraps everything in one transaction, so those
// statements are applied here in autocommit instead.
const NON_TRANSACTIONAL = /\bCONCURRENTLY\b/i;

const TRACKING_TABLE = `"drizzle"."__drizzle_migrations"`;

async function recordApplied(
	client: pg.Client,
	migration: MigrationMeta,
): Promise<void> {
	await client.query(
		`INSERT INTO ${TRACKING_TABLE} ("hash", "created_at") VALUES ($1, $2)`,
		[migration.hash, migration.folderMillis],
	);
}

export type ApplyResult = { transactional: boolean };

/**
 * Applies one migration's statements. If any statement is non-transactional
 * (CONCURRENTLY), the whole migration runs in autocommit; otherwise it's wrapped
 * in a single transaction so DDL + tracking row commit atomically — matching
 * drizzle's own per-migration semantics.
 */
export async function applyMigration(
	client: pg.Client,
	migration: MigrationMeta,
): Promise<ApplyResult> {
	const statements = migration.sql
		.map((statement) => statement.trim())
		.filter(Boolean);
	const nonTransactional = statements.some((statement) =>
		NON_TRANSACTIONAL.test(statement),
	);

	if (nonTransactional) {
		for (const statement of statements) {
			await client.query(statement);
		}
		await recordApplied(client, migration);
		return { transactional: false };
	}

	await client.query("BEGIN");
	try {
		for (const statement of statements) {
			await client.query(statement);
		}
		await recordApplied(client, migration);
		await client.query("COMMIT");
	} catch (err) {
		await client.query("ROLLBACK");
		throw err;
	}
	return { transactional: true };
}
