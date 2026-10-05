import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createCommitterDb } from "../../../src/external/postgres/getWorkerDb.js";
import { createDatabaseTimings } from "../../../src/logging/databaseTimings.js";

const dialect = new PgDialect();

/** A drizzle stand-in: records every statement, which executor ran it, and how each transaction ended.
 *  A flush whose guarded row did not move aborts as Postgres does, on its rollback marker's integer cast. */
function createFakePostgres({ applied = [1] }: { applied?: number[] } = {}) {
	const statements: { via: "pool" | "tx"; sql: string; params: unknown[] }[] =
		[];
	const transactions: ("committed" | "rolled_back")[] = [];
	function executorFor(via: "pool" | "tx") {
		return {
			execute: async (query: SQL) => {
				const { sql, params } = dialect.sqlToQuery(query);
				statements.push({ via, sql, params });
				const marker = /E'(flush_rolled_back:[0-9a-f]+:)'/.exec(sql)?.[1];
				if (marker && applied.includes(0))
					throw Object.assign(
						new Error(
							`invalid input syntax for type integer: "${marker}1:${applied.join(",")}"`,
						),
						{ errno: "22P02" },
					);
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
		expect(fake.statements.map((statement) => statement.via)).toEqual([
			"pool",
			"pool",
		]);
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
		expect(fake.statements.map((statement) => statement.via)).toEqual(["pool"]);
		expect(fake.transactions).toEqual([]);
	});
});
