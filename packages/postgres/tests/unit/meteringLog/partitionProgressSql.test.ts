import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	insertPartitionProgress,
	readNextOffset,
} from "../../../src/meteringLog/repos/partitionProgress.js";

const dialect = new PgDialect();

/** Captures the statement instead of running it; `rows` is what execute returns. */
const capturingDb = ({ rows }: { rows: unknown[] }) => {
	const statements: { sql: string; params: unknown[] }[] = [];
	const execute = async (query: SQL) => {
		statements.push(dialect.sqlToQuery(query));
		return rows as never;
	};
	return { db: { execute }, statements };
};

describe("partitionProgress repo", () => {
	test("readNextOffset normalises int8 however the driver returns it", async () => {
		for (const raw of ["43", 43, 43n]) {
			const { db } = capturingDb({ rows: [{ next_offset: raw }] });
			expect(
				await readNextOffset({ ctx: { db }, topic: "metering", partition: 7 }),
			).toBe(43n);
		}
		const { db, statements } = capturingDb({ rows: [] });
		expect(
			await readNextOffset({ ctx: { db }, topic: "metering", partition: 7 }),
		).toBeNull();
		expect(statements[0]?.params).toEqual(["metering", 7]);
	});

	test("readNextOffset refuses a value that is not an offset", async () => {
		const { db } = capturingDb({ rows: [{ next_offset: "-1" }] });
		await expect(
			readNextOffset({ ctx: { db }, topic: "metering", partition: 7 }),
		).rejects.toThrow("partition_progress rows failed validation");
	});

	test("insert binds every input as a parameter", async () => {
		const { db, statements } = capturingDb({ rows: [] });
		await insertPartitionProgress({
			ctx: { db },
			topic: "metering",
			partition: 7,
			nextOffset: 0n,
		});
		expect(statements.map((statement) => statement.params)).toEqual([
			["metering", 7, 0n],
		]);
	});
});
