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
				return sql.includes("RETURNING id")
					? [{ id: String(params[1]) }]
					: [{ topic: "metering" }];
			},
		};
	}
	const db = {
		...executorFor("pool"),
		transaction: async <T>(run: (tx: ReturnType<typeof executorFor>) => Promise<T>) =>
			run(executorFor("tx")),
	};
	return { db, statements };
}

describe("createCommitterDb", () => {
	test("runs row updates and the progress advance on the transaction, reads on the pool", async () => {
		const fake = createFakePostgres();
		const committerDb = createCommitterDb({
			ctx: { postgres: { db: fake.db as never } },
		});

		await committerDb.insertPartitionProgress({
			topic: "metering",
			partition: 7,
			nextOffset: 43n,
		});
		const result = await committerDb.transaction(async (tx) => {
			const { applied } = await tx.applySubjectRowUpdates({
				updates: [
					{
						table: "customerEntitlements",
						id: "ce_1",
						before: { balance: 100 },
						after: { balance: 95 },
					},
				],
			});
			const { advanced } = await tx.advancePartitionProgress({
				topic: "metering",
				partition: 7,
				expectedOffset: 43n,
				nextOffset: 44n,
			});
			return { applied, advanced };
		});

		expect(result).toEqual({ applied: [true], advanced: true });
		expect(fake.statements.map((statement) => statement.via)).toEqual([
			"pool",
			"tx",
			"tx",
		]);
		expect(fake.statements[1]?.sql).toContain('UPDATE "customer_entitlements"');
		expect(fake.statements[2]?.sql).toContain("UPDATE partition_progress");
	});
});
