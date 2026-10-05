import { expect, test } from "bun:test";
import { setImmediate } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createMigrationPageDb } from "@/internal/migrations/v2/batchOperations/execute/database/createMigrationPageDb.js";
import { MigrationCommitUnknownError } from "@/internal/migrations/v2/batchOperations/execute/database/runMigrationTransaction.js";
import { createPgResponseFaultProxy } from "./utils/createPgResponseFaultProxy.js";

const fixtureUrl = process.env.MIGRATION_TEST_DATABASE_URL;
if (!fixtureUrl || new URL(fixtureUrl).hostname !== "127.0.0.1") {
	throw new Error(
		"MIGRATION_TEST_DATABASE_URL must target isolated loopback Postgres",
	);
}

test("lost COMMIT reply stops replay while the committed row survives", async () => {
	const proxy = await createPgResponseFaultProxy({
		fixtureUrl,
		lostCommand: "COMMIT",
	});
	const admin = new pg.Pool({ connectionString: fixtureUrl, ssl: false });
	const pool = new pg.Pool({ connectionString: proxy.connectionString, ssl: false });
	const page = createMigrationPageDb({
		ctx: { db: drizzle(pool) as unknown as DrizzleCli },
		queryTimeoutMs: 50,
		maxAttempts: 2,
	});
	let attempts = 0;
	try {
		await admin.query("CREATE TABLE migration_fault_commit (value integer)");
		const work = page.db.transaction(async (transaction) => {
			attempts += 1;
			await transaction.execute(sql`INSERT INTO migration_fault_commit VALUES (1)`);
		});
		await expect(work).rejects.toBeInstanceOf(MigrationCommitUnknownError);
		expect(attempts).toBe(1);
		expect(proxy.inspect()).toEqual({ commits: 1, suppressedResponses: 1 });
		expect((await admin.query("SELECT value FROM migration_fault_commit")).rows).toEqual([
			{ value: 1 },
		]);
	} finally {
		page.abort();
		await pool.end();
		await proxy.close();
		await admin.query("DROP TABLE IF EXISTS migration_fault_commit");
		await admin.end();
	}
});

test("abort fences a late callback and preserves the prior committed batch", async () => {
	const proxy = await createPgResponseFaultProxy({ fixtureUrl });
	const admin = new pg.Pool({ connectionString: fixtureUrl, ssl: false });
	const pool = new pg.Pool({ connectionString: proxy.connectionString, ssl: false });
	const page = createMigrationPageDb({
		ctx: { db: drizzle(pool) as unknown as DrizzleCli },
		queryTimeoutMs: 50,
		maxAttempts: 2,
	});
	const entered = Promise.withResolvers<void>();
	const resume = Promise.withResolvers<void>();
	const returned = Promise.withResolvers<void>();
	let finalized = false;
	let attempts = 0;
	try {
		await admin.query("CREATE TABLE migration_fault_abort (value integer)");
		await page.db.transaction(async (transaction) => {
			await transaction.execute(sql`INSERT INTO migration_fault_abort VALUES (1)`);
		});
		const work = page.db.transaction(async (transaction) => {
			attempts += 1;
			await transaction.execute(sql`INSERT INTO migration_fault_abort VALUES (2)`);
			entered.resolve();
			await resume.promise;
			returned.resolve();
		});
		const completion = work.then(() => {
			finalized = true;
		});
		const aborted = expect(completion).rejects.toThrow("fixture page aborted");
		await entered.promise;
		page.abort(new Error("fixture page aborted"));
		await aborted;
		resume.resolve();
		await returned.promise;
		await setImmediate();
		expect(attempts).toBe(1);
		expect(finalized).toBe(false);
		expect(proxy.inspect().commits).toBe(1);
		expect((await admin.query("SELECT value FROM migration_fault_abort")).rows).toEqual([
			{ value: 1 },
		]);
	} finally {
		resume.resolve();
		page.abort();
		await pool.end();
		await proxy.close();
		await admin.query("DROP TABLE IF EXISTS migration_fault_abort");
		await admin.end();
	}
});

for (const lostCommand of ["BEGIN", "SET"]) {
	test(`lost ${lostCommand} reply retries on a fresh connection before commit`, async () => {
		const proxy = await createPgResponseFaultProxy({ fixtureUrl, lostCommand });
		const pool = new pg.Pool({ connectionString: proxy.connectionString, ssl: false });
		const page = createMigrationPageDb({
			ctx: { db: drizzle(pool) as unknown as DrizzleCli },
			queryTimeoutMs: 50,
			maxAttempts: 2,
		});
		let removed = 0;
		pool.on("remove", () => { removed += 1; });
		try {
			const result = await page.db.transaction(async (transaction) => {
				await transaction.execute(sql`SET LOCAL statement_timeout = 1000`);
				return "committed";
			});
			expect(result).toBe("committed");
			expect(removed).toBeGreaterThanOrEqual(1);
			expect(proxy.inspect()).toEqual({ commits: 1, suppressedResponses: 1 });
		} finally {
			page.abort();
			await pool.end();
			await proxy.close();
		}
	});
}
