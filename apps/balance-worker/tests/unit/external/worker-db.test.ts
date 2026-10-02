import { describe, expect, test } from "bun:test";
import { createWorkerDb } from "../../../src/external/postgres/getWorkerDb.js";
import { createDatabaseTimings } from "../../../src/logging/databaseTimings.js";

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
		).toEqual({ snapshot: null, envelope: null });
		expect(gated).toEqual(["subject_rows"]);
		const drained = timings.drain();
		expect(drained.queries.subject_rows).toMatchObject({ count: 1 });
		// Not asked for a snapshot, so nothing to count as a hit or a miss.
		expect(drained).not.toHaveProperty("subjectSnapshots");
	});

	test("a read that asked for a snapshot counts a hit or a miss on the database line", async () => {
		const timings = createDatabaseTimings();
		let answer: Record<string, unknown> = { snapshot: null, envelope: null };
		const db = createWorkerDb({
			ctx: {
				postgres: { db: { execute: async () => [answer] } as never },
				subjectLoads: { run: async (load) => load() },
				timings,
			},
		});
		await db.getSubjectRows({
			identity,
			asOfTimestampMs: 1_700_000_000_000,
			snapshotVersion: 1,
		});
		answer = { snapshot: { revision: 0 }, envelope: null };
		await db.getSubjectRows({
			identity,
			asOfTimestampMs: 1_700_000_000_000,
			snapshotVersion: 1,
		});
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
