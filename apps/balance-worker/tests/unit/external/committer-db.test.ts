import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createCommitterDb } from "../../../src/external/postgres/getWorkerDb.js";
import { createDatabaseTimings } from "../../../src/logging/databaseTimings.js";

const dialect = new PgDialect();

/** A drizzle stand-in: records every statement and every transaction it was asked to open.
 *  A flush whose guarded row did not move aborts as Postgres does, on its rollback marker's integer cast. */
function createFakePostgres({ applied = [1] }: { applied?: number[] } = {}) {
	const statements: { sql: string; params: unknown[] }[] = [];
	const transactions: string[] = [];
	const db = {
		execute: async (query: SQL) => {
			const { sql, params } = dialect.sqlToQuery(query);
			statements.push({ sql, params });
			const marker = /E'(flush_rolled_back:[0-9a-f]+:)'/.exec(sql)?.[1];
			if (marker && applied.includes(0))
				throw Object.assign(
					new Error(
						`invalid input syntax for type integer: "${marker}1:${applied.join(",")}"`,
					),
					{ code: "22P02", severity: "ERROR" },
				);
			// pg answers a multi-statement simple query with one result per statement.
			if (sql.includes("AS snapshot_deletes"))
				return [
					{ rows: [] },
					{
						rows: [
							{
								applied,
								bookmarks: 1,
								snapshot_upserts: 2,
								snapshot_deletes: ["", "en_1", "en_2", "en_3"].map(
									(entityId) => ({
										org_id: "org_1",
										env: "live",
										customer_id: "cus_1",
										entity_id: entityId,
									}),
								),
							},
						],
					},
				];
			return sql.includes("AS bookmarks")
				? [{ rows: [] }, { rows: [{ applied, bookmarks: 1 }] }]
				: { rows: [{ topic: "metering" }] };
		},
		$client: {
			connect: async () => {
				transactions.push("opened");
				throw new Error("the flush opened a transaction");
			},
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
	test("a flush is one simple query on the pool, bounded by its statement timeout, its counts read back", async () => {
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
		expect(fake.statements).toHaveLength(2);
		expect(fake.statements[1]?.sql).toStartWith(
			"SET LOCAL statement_timeout = 2000; ",
		);
		expect(fake.statements[1]?.params).toEqual([]);
		expect(fake.statements[1]?.sql).toContain('WITH "u0" AS (');
		expect(fake.statements[1]?.sql).toContain('UPDATE "customer_entitlements"');
		expect(fake.statements[1]?.sql).toContain("UPDATE partition_progress");
		expect(fake.transactions).toEqual([]);
	});

	test("a guarded row that no longer matches aborts the whole query: no row and no bookmark lands", async () => {
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
		expect(fake.statements).toHaveLength(1);
		expect(fake.transactions).toEqual([]);
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

		expect(result.snapshots?.upserted).toBe(2);
		expect(result.snapshots?.deleted.map((row) => row.entityId)).toEqual([
			null,
			"en_1",
			"en_2",
			"en_3",
		]);
		expect(timings.drain().subjectSnapshots).toEqual({
			upserted: 2,
			deleted: 4,
			hits: 0,
			misses: 0,
			served: 0,
			unreadable: 0,
		});
	});
});
