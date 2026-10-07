import { describe, expect, test } from "bun:test";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createWorkerDb } from "../../../src/external/postgres/getWorkerDb.js";
import { createDatabaseTimings } from "../../../src/logging/databaseTimings.js";

const dialect = new PgDialect();
const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_missing",
	entityId: null,
};

describe("createWorkerDb", () => {
	test("a subject read waits for the subject load gate and is timed as a subject load", async () => {
		const gated: string[] = [];
		const timings = createDatabaseTimings();
		const db = createWorkerDb({
			ctx: {
				postgres: { db: { execute: async () => ({ rows: [] }) } as never },
				subjectLoads: {
					run: async (load) => {
						gated.push("subject_rows");
						return load();
					},
				},
				timings,
			},
		});

		expect(
			await db.getSubjectRows({ identity, asOfTimestampMs: 1_700_000_000_000 }),
		).toBeNull();
		expect(gated).toEqual(["subject_rows"]);
		const drained = timings.drain();
		expect(drained.queries.subject_rows).toMatchObject({ count: 1 });
		// Not a probe, so nothing to count as a hit or a miss.
		expect(drained).not.toHaveProperty("subjectSnapshots");
	});

	test("a snapshot probe waits for the gate, asks for this build's version, and counts a hit or a miss on the database line", async () => {
		const gated: string[] = [];
		const timings = createDatabaseTimings();
		const statements: { params: unknown[] }[] = [];
		let answer: Record<string, unknown>[] = [];
		const db = createWorkerDb({
			ctx: {
				postgres: {
					db: {
						execute: async (query: unknown) => {
							statements.push(dialect.sqlToQuery(query as SQL));
							return { rows: answer };
						},
					} as never,
				},
				subjectLoads: {
					run: async (load) => {
						gated.push("subject_snapshot");
						return load();
					},
				},
				timings,
			},
		});
		expect(await db.readSubjectSnapshot({ identity })).toBeNull();
		answer = [{ state: { revision: 0 } }];
		expect(await db.readSubjectSnapshot({ identity })).toEqual({
			revision: 0,
		});
		expect(gated).toEqual(["subject_snapshot", "subject_snapshot"]);
		expect(statements[0]?.params).toContain(
			BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
		);
		const drained = timings.drain();
		expect(drained.queries.subject_snapshot).toMatchObject({ count: 2 });
		expect(drained.subjectSnapshots).toEqual({
			upserted: 0,
			deleted: 0,
			hits: 1,
			misses: 1,
		});
	});

	test("a batched entity read waits for the same gate and is timed as an entity load", async () => {
		const gated: string[] = [];
		const timings = createDatabaseTimings();
		const db = createWorkerDb({
			ctx: {
				postgres: { db: { execute: async () => ({ rows: [] }) } as never },
				subjectLoads: {
					run: async (load) => {
						gated.push("entity_rows");
						return load();
					},
				},
				timings,
			},
		});

		await db.getEntitySubjectRows({
			identity,
			entityIds: ["ent_1", "ent_2"],
			asOfTimestampMs: 1_700_000_000_000,
		});
		expect(gated).toEqual(["entity_rows"]);
		expect(timings.drain().queries.entity_rows).toMatchObject({ count: 1 });
	});
});
