import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createCommitterDb } from "../../../src/external/postgres/getWorkerDb.js";

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
			ctx: { postgres: { db: fake.db as never } },
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
			ctx: { postgres: { db: fake.db as never } },
		});

		const result = await committerDb.flush({
			changes: [balanceIncrement, { ...balanceIncrement, id: "ce_gone" }],
			bookmarks: [bookmark],
		});

		expect(result).toEqual({ applied: [true, false] });
		expect(fake.transactions).toEqual(["rolled_back"]);
	});
});
