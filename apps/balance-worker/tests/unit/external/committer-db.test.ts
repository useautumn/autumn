import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createCommitterDb } from "../../../src/external/postgres/getWorkerDb.js";
import { createDatabaseTimings } from "../../../src/logging/databaseTimings.js";

const dialect = new PgDialect();

/** A drizzle stand-in: records every statement, which executor ran it, and how each transaction ended. */
function createFakePostgres({ applied = [1] }: { applied?: number[] } = {}) {
	const statements: { via: "pool" | "tx"; sql: string; params: unknown[] }[] =
		[];
	const transactions: ("committed" | "rolled_back")[] = [];
	function executorFor(via: "pool" | "tx") {
		return {
			execute: async (query: SQL) => {
				const { sql, params } = dialect.sqlToQuery(query);
				statements.push({ via, sql, params });
				if (sql.includes("AS snapshot_deletes"))
					return [
						{ applied, bookmarks: 1, snapshot_upserts: 2, snapshot_deletes: 4 },
					];
				return sql.includes("AS bookmarks")
					? [{ applied, bookmarks: 1 }]
					: [{ topic: "metering" }];
			},
		};
	}
	const db = {
		...executorFor("pool"),
		transaction: async <T>(
			run: (tx: ReturnType<typeof executorFor>) => Promise<T>,
		) => {
			try {
				const result = await run(executorFor("tx"));
				transactions.push("committed");
				return result;
			} catch (cause) {
				transactions.push("rolled_back");
				throw cause;
			}
		},
	};
	return { db, statements, transactions };
}

const balanceIncrement = {
	op: "update",
	table: "customerEntitlements",
	id: "ce_1",
	set: {},
	add: { balance: -5 },
	addEntries: {},
	guard: {},
} as const;

const bookmark = {
	topic: "metering",
	partition: 7,
	expectedOffset: 43n,
	nextOffset: 44n,
};

describe("createCommitterDb", () => {
	test("a flush is one transaction: the statement timeout, one statement, and the counts read back", async () => {
		const fake = createFakePostgres();
		const committerDb = createCommitterDb({
			ctx: {
				postgres: { db: fake.db as never },
				timings: createDatabaseTimings(),
			},
		});

		await committerDb.insertPartitionProgress({
			topic: "metering",
			partition: 7,
			nextOffset: 43n,
		});
		const result = await committerDb.flush({
			changes: [balanceIncrement],
			bookmarks: [bookmark],
		});

		expect(result).toEqual({ applied: [true] });
		expect(fake.statements.map((statement) => statement.via)).toEqual([
			"pool",
			"tx",
			"tx",
		]);
		expect(fake.statements[1]?.sql).toBe("SET LOCAL statement_timeout = 2000");
		expect(fake.statements[2]?.sql).toContain('WITH "u0" AS (');
		expect(fake.statements[2]?.sql).toContain('UPDATE "customer_entitlements"');
		expect(fake.statements[2]?.sql).toContain("UPDATE partition_progress");
		expect(fake.transactions).toEqual(["committed"]);
	});

	test("a guarded row that no longer matches rolls the whole flush back: no row and no bookmark lands", async () => {
		const fake = createFakePostgres({ applied: [1, 0] });
		const committerDb = createCommitterDb({
			ctx: {
				postgres: { db: fake.db as never },
				timings: createDatabaseTimings(),
			},
		});

		const result = await committerDb.flush({
			changes: [balanceIncrement, { ...balanceIncrement, id: "ce_gone" }],
			bookmarks: [bookmark],
		});

		expect(result).toEqual({ applied: [true, false] });
		expect(fake.transactions).toEqual(["rolled_back"]);
	});

	test("a flush that writes snapshots counts what it upserted and deleted", async () => {
		const fake = createFakePostgres();
		const timings = createDatabaseTimings();
		const committerDb = createCommitterDb({
			ctx: { postgres: { db: fake.db as never }, timings },
		});

		const result = await committerDb.flush({
			changes: [balanceIncrement],
			bookmarks: [bookmark],
			snapshots: {
				upserts: [
					{
						orgId: "org_1",
						env: "live",
						customerId: "cus_2",
						entityId: null,
						internalCustomerId: "cus_int_2",
						internalEntityId: null,
						partition: 0,
						partitionCount: 1,
						stateVersion: 1,
						stateJson: "{}",
						baselineAt: 0,
						logOffset: 0n,
					},
				],
				deletes: [{ orgId: "org_1", env: "live", customerId: "cus_1" }],
			},
		});

		expect(result.snapshots).toEqual({ upserted: 2, deleted: 4 });
		expect(timings.drain().subjectSnapshots).toEqual({
			upserted: 2,
			deleted: 4,
			hits: 0,
			misses: 0,
		});
	});
});
