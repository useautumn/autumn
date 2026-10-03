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
				postgres: { db: { execute: async () => [] } as never },
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
		expect(timings.drain().queries.subject_rows).toMatchObject({ count: 1 });
	});

	test("a snapshot probe asks for this build's version and counts a hit per row and a miss per key without one", async () => {
		const timings = createDatabaseTimings();
		const statements: { sql: string; params: unknown[] }[] = [];
		const db = createWorkerDb({
			ctx: {
				postgres: {
					db: {
						execute: async (query: unknown) => {
							statements.push(dialect.sqlToQuery(query as SQL));
							return [
								{
									org_id: "org_1",
									env: "sandbox",
									customer_id: "cus_hit",
									entity_id: "",
									state: { revision: 0 },
									baseline_at: "1",
								},
							];
						},
					} as never,
				},
				subjectLoads: { run: async (load) => load() },
				timings,
			},
		});
		const rows = await db.readSubjectSnapshots({
			identities: [identity, { ...identity, customerId: "cus_hit" }],
		});
		expect(rows.map((row) => row.customerId)).toEqual(["cus_hit"]);
		expect(statements[0]?.params).toContain(
			BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
		);
		expect(timings.drain().subjectSnapshots).toEqual({
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
				postgres: { db: { execute: async () => [] } as never },
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
