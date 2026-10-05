import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createMigrationPageDb } from "@/internal/migrations/v2/batchOperations/execute/database/createMigrationPageDb.js";

test("migration query deadline discards the connection and retries only its transaction", async () => {
	const connectionString = process.env.MIGRATION_TEST_DATABASE_URL;
	if (
		!connectionString ||
		!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname)
	) {
		throw new Error(
			"MIGRATION_TEST_DATABASE_URL must name an isolated loopback PostgreSQL",
		);
	}
	const pool = new pg.Pool({ connectionString, max: 2 });
	const page = createMigrationPageDb({
		ctx: { db: drizzle(pool) as unknown as DrizzleCli },
		queryTimeoutMs: 50,
		maxAttempts: 2,
	});
	const backendIds: number[] = [];
	let attempts = 0;
	try {
		await page.db.transaction(async (transaction) => {
			attempts++;
			const result = await transaction.execute(
				sql`select pg_backend_pid() as id`,
			);
			const rows = Array.isArray(result) ? result : result.rows;
			backendIds.push(rows[0].id as number);
			await transaction.execute(
				sql`select pg_sleep(${attempts === 1 ? 0.3 : 0})`,
			);
		});
		expect(attempts).toBe(2);
		expect(new Set(backendIds).size).toBe(2);
	} finally {
		page.abort();
		await pool.end();
	}
}, 5000);
