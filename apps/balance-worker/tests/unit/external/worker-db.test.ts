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
		).toBeNull();
		expect(gated).toEqual(["subject_rows"]);
		expect(timings.drain().queries.subject_rows).toMatchObject({ count: 1 });
	});
});
