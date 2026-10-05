import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { iterateCustomerProductPages } from "@/internal/migrations/v2/batchOperations/execute/customerProductPagination/iterateCustomerProductPages.js";
import { createMigrationPageDb } from "@/internal/migrations/v2/batchOperations/execute/database/createMigrationPageDb.js";
import { MigrationDbDeadlineError } from "@/internal/migrations/v2/batchOperations/execute/database/runMigrationTransaction.js";
import { loopbackDatabaseUrl } from "./utils/loopbackDatabaseUrl.js";

const databaseUrl = loopbackDatabaseUrl();

const withPageDb = async ({
	poolMax = 2,
	queryTimeoutMs,
	maxAttempts,
	run,
}: {
	poolMax?: number;
	queryTimeoutMs: number;
	maxAttempts: number;
	run: (args: {
		pool: pg.Pool;
		page: ReturnType<typeof createMigrationPageDb>;
	}) => Promise<void>;
}) => {
	const pool = new pg.Pool({ connectionString: databaseUrl, max: poolMax });
	const page = createMigrationPageDb({
		ctx: { db: drizzle(pool) as unknown as DrizzleCli },
		queryTimeoutMs,
		maxAttempts,
	});
	try {
		await run({ pool, page });
	} finally {
		page.abort();
		await pool.end();
	}
};

const rowsOf = async ({ table }: { table: string }) => {
	const admin = new pg.Client({ connectionString: databaseUrl });
	await admin.connect();
	try {
		return (await admin.query(`SELECT value FROM ${table} ORDER BY value`))
			.rows;
	} finally {
		await admin.end();
	}
};

const withScratchTable = async ({
	table,
	run,
}: {
	table: string;
	run: () => Promise<void>;
}) => {
	const admin = new pg.Client({ connectionString: databaseUrl });
	await admin.connect();
	try {
		await admin.query(`DROP TABLE IF EXISTS ${table}`);
		await admin.query(`CREATE TABLE ${table} (value integer)`);
		await run();
	} finally {
		await admin.query(`DROP TABLE IF EXISTS ${table}`);
		await admin.end();
	}
};

describe.skipIf(!databaseUrl)("migration query deadline", () => {
	test("migration query deadline discards the connection and retries only its transaction", async () => {
		const backendIds: number[] = [];
		let attempts = 0;
		await withPageDb({
			queryTimeoutMs: 50,
			maxAttempts: 2,
			run: async ({ page }) => {
				await page.db.transaction(async (transaction) => {
					attempts++;
					const [row] = await transaction.execute<{ id: number }>(
						sql`select pg_backend_pid() as id`,
					);
					backendIds.push(row.id);
					await transaction.execute(
						sql`select pg_sleep(${attempts === 1 ? 0.3 : 0})`,
					);
				});
			},
		});
		expect(attempts).toBe(2);
		expect(new Set(backendIds).size).toBe(2);
	}, 5000);

	test("acquisition deadline never hands out a client that connects late", async () => {
		let removed = 0;
		await withPageDb({
			poolMax: 1,
			queryTimeoutMs: 100,
			maxAttempts: 1,
			run: async ({ pool, page }) => {
				pool.on("remove", () => {
					removed++;
				});
				const held = await pool.connect();
				let ran = false;
				const work = page.db.transaction(async () => {
					ran = true;
				});
				await expect(work).rejects.toBeInstanceOf(MigrationDbDeadlineError);
				held.release();
				await new Promise((resolve) => setTimeout(resolve, 100));
				expect(ran).toBe(false);
				expect(removed).toBe(1);
				expect(pool.waitingCount).toBe(0);
			},
		});
	}, 5000);

	test("aborting a standalone write stops it from committing late", async () => {
		const table = "migration_deadline_standalone";
		await withScratchTable({
			table,
			run: () =>
				withPageDb({
					queryTimeoutMs: 5000,
					maxAttempts: 1,
					run: async ({ page }) => {
						const write = page.db.execute(
							sql.raw(`INSERT INTO ${table} SELECT 1 FROM pg_sleep(0.3)`),
						);
						const outcome = write.then(
							() => null,
							(error: unknown) => error,
						);
						await new Promise((resolve) => setTimeout(resolve, 50));
						page.abort(new Error("page aborted"));
						expect(await outcome).toEqual(new Error("page aborted"));
						await new Promise((resolve) => setTimeout(resolve, 600));
						expect(await rowsOf({ table })).toEqual([]);
					},
				}),
		});
	}, 5000);

	test("a retried batch publishes each committed result exactly once", async () => {
		const table = "migration_deadline_batches";
		const published: number[] = [];
		const attemptsByBatch = new Map<number, number>();
		await withScratchTable({
			table,
			run: () =>
				withPageDb({
					queryTimeoutMs: 100,
					maxAttempts: 2,
					run: async ({ page }) => {
						await iterateCustomerProductPages({
							db: page.db,
							pageSize: 1,
							executePage: async ({ transaction, afterCustomerProductId }) => {
								const batch = Number(afterCustomerProductId ?? 0) + 1;
								if (batch > 3) return { rows: [], result: [] };
								const attempt = (attemptsByBatch.get(batch) ?? 0) + 1;
								attemptsByBatch.set(batch, attempt);
								await transaction.execute(
									sql.raw(`INSERT INTO ${table} VALUES (${batch})`),
								);
								if (batch === 2 && attempt === 1)
									await transaction.execute(sql`select pg_sleep(0.3)`);
								return {
									rows: [{ customerProductId: String(batch) }],
									result: [batch],
								};
							},
							onCommit: (result) => published.push(...result),
						});
					},
				}),
		});
		expect(attemptsByBatch.get(2)).toBe(2);
		expect(published).toEqual([1, 2, 3]);
	}, 5000);
});
