import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createCommitterDb } from "../../../src/external/postgres/getWorkerDb.js";

const dialect = new PgDialect();

/** A drizzle stand-in: records every statement and which executor ran it. */
function createFakePostgres() {
	const statements: { via: "pool" | "tx"; sql: string; params: unknown[] }[] =
		[];
	function executorFor(via: "pool" | "tx") {
		return {
			execute: async (query: SQL) => {
				const { sql, params } = dialect.sqlToQuery(query);
				statements.push({ via, sql, params });
				return sql.includes("AS bookmarks")
					? [{ applied: [1], bookmarks: 1 }]
					: [{ topic: "metering" }];
			},
		};
	}
	const db = {
		...executorFor("pool"),
		transaction: async <T>(
			run: (tx: ReturnType<typeof executorFor>) => Promise<T>,
		) => run(executorFor("tx")),
	};
	return { db, statements };
}

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
			changes: [
				{
					op: "update",
					table: "customerEntitlements",
					id: "ce_1",
					set: {},
					add: { balance: -5 },
					addEntries: {},
					guard: {},
				},
			],
			bookmarks: [
				{
					topic: "metering",
					partition: 7,
					expectedOffset: 43n,
					nextOffset: 44n,
				},
			],
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
	});
});
