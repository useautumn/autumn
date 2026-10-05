import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { iterateCustomerProductPages } from "@/internal/migrations/v2/batchOperations/execute/customerProductPagination/iterateCustomerProductPages.js";
import { createMigrationPageDb } from "@/internal/migrations/v2/batchOperations/execute/database/createMigrationPageDb.js";
import { MigrationDbDeadlineError } from "@/internal/migrations/v2/batchOperations/execute/database/runMigrationTransaction.js";
import {
	migrationTestDatabaseUrl,
	withScratchSchema,
} from "./utils/scratchDatabase.js";

const databaseUrl = migrationTestDatabaseUrl() as string;

const withPageDb = async ({
	options,
	poolMax = 2,
	queryTimeoutMs,
	maxAttempts,
	retryDelayMs = 10,
	run,
}: {
	options?: string;
	poolMax?: number;
	queryTimeoutMs: number;
	maxAttempts?: number;
	retryDelayMs?: number;
	run: (args: {
		pool: pg.Pool;
		page: ReturnType<typeof createMigrationPageDb>;
	}) => Promise<void>;
}) => {
	const pool = new pg.Pool({
		connectionString: databaseUrl,
		max: poolMax,
		options,
	});
	const page = createMigrationPageDb({
		ctx: { db: drizzle(pool) as unknown as DrizzleCli },
		queryTimeoutMs,
		maxAttempts,
		retryDelayMs,
	});
	try {
		await run({ pool, page });
	} finally {
		page.abort();
		await pool.end();
	}
};

const rowsOf = async ({
	options,
	table,
}: {
	options: string;
	table: string;
}) => {
	const admin = new pg.Client({ connectionString: databaseUrl, options });
	await admin.connect();
	try {
		return (await admin.query(`SELECT value FROM ${table} ORDER BY value`))
			.rows;
	} finally {
		await admin.end();
	}
};

/** Creates `table` inside a scratch schema the test owns. */
const withScratchTable = ({
	table,
	run,
}: {
	table: string;
	run: (args: { options: string }) => Promise<void>;
}) =>
	withScratchSchema({
		databaseUrl,
		run: async ({ options }) => {
			const admin = new pg.Client({ connectionString: databaseUrl, options });
			await admin.connect();
			try {
				await admin.query(`CREATE TABLE ${table} (value integer)`);
			} finally {
				await admin.end();
			}
			await run({ options });
		},
	});

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
					const result = await transaction.execute(
						sql`select pg_backend_pid() as id`,
					);
					const rows = Array.isArray(result) ? result : result.rows;
					backendIds.push(rows[0].id as number);
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
			run: ({ options }) =>
				withPageDb({
					options,
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
						expect(await rowsOf({ options, table })).toEqual([]);
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
			run: ({ options }) =>
				withPageDb({
					options,
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

	test("a statement's deadline starts when it is sent, not while queued behind others", async () => {
		let attempts = 0;
		await withPageDb({
			queryTimeoutMs: 250,
			maxAttempts: 1,
			run: async ({ page }) => {
				await page.db.transaction(async (transaction) => {
					attempts++;
					await Promise.all(
						[1, 2, 3].map(() =>
							transaction.execute(sql`select pg_sleep(0.15)`),
						),
					);
				});
			},
		});
		expect(attempts).toBe(1);
	}, 5000);

	test("default retries back off and ride out several consecutive transient failures", async () => {
		let attempts = 0;
		const startedAt = Date.now();
		await withPageDb({
			queryTimeoutMs: 100,
			retryDelayMs: 50,
			run: async ({ page }) => {
				await page.db.transaction(async (transaction) => {
					attempts++;
					await transaction.execute(
						sql`select pg_sleep(${attempts <= 3 ? 0.3 : 0})`,
					);
				});
			},
		});
		expect(attempts).toBe(4);
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(50 + 100 + 200);
	}, 10000);

	test("a page abort cuts a retry backoff short", async () => {
		let attempts = 0;
		await withPageDb({
			queryTimeoutMs: 100,
			maxAttempts: 3,
			retryDelayMs: 5000,
			run: async ({ page }) => {
				const work = page.db
					.transaction(async (transaction) => {
						attempts++;
						await transaction.execute(sql`select pg_sleep(0.3)`);
					})
					.then(
						() => null,
						(error: unknown) => error,
					);
				await new Promise((resolve) => setTimeout(resolve, 300));
				const abortedAt = Date.now();
				page.abort(new Error("page aborted"));
				expect(await work).toEqual(new Error("page aborted"));
				expect(Date.now() - abortedAt).toBeLessThan(500);
			},
		});
		expect(attempts).toBe(1);
	}, 5000);

	test("an abandoned standalone statement is cancelled on the server too", async () => {
		const marker = `standalone_${Date.now()}`;
		await withPageDb({
			queryTimeoutMs: 200,
			maxAttempts: 1,
			run: async ({ page }) => {
				const outcome = await page.db
					.execute(sql.raw(`select pg_sleep(3) as ${marker}`))
					.then(
						() => null,
						(error: unknown) => error,
					);
				expect(outcome).toBeInstanceOf(MigrationDbDeadlineError);
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 500));
		const admin = new pg.Client({ connectionString: databaseUrl });
		await admin.connect();
		try {
			const running = await admin.query(
				"SELECT pid FROM pg_stat_activity WHERE state = 'active' AND query LIKE $1",
				[`%${marker}%`],
			);
			expect(running.rows).toEqual([]);
		} finally {
			await admin.end();
		}
	}, 5000);
});
