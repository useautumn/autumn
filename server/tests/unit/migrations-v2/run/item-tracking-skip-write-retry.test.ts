// Contract: a customer skipped after a connection drop must not keep its `running` claim
// when the skip write itself hits a transient DB error.
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { withMigrationItemTracking } from "@/internal/migrations/v2/actions/migrationItem/withMigrationItemTracking.js";
import {
	migrationItemEventRepo,
	migrationItemRunRepo,
} from "@/internal/migrations/v2/repos/index.js";

const poolTimeout = () => new Error("timeout exceeded when trying to connect");

describe("withMigrationItemTracking connection-drop skip", () => {
	const spies: { mockRestore: () => void }[] = [];
	afterEach(() => {
		for (const spy of spies.splice(0)) spy.mockRestore();
	});

	test("retries the skip write so the claim never stays running", async () => {
		let skipWrites = 0;
		spies.push(
			spyOn(migrationItemRunRepo, "markSkipped").mockImplementation(
				async () => {
					skipWrites++;
					if (skipWrites === 1) throw poolTimeout();
					return undefined as never;
				},
			),
			spyOn(migrationItemEventRepo, "insert").mockImplementation(
				async () => undefined as never,
			),
		);

		const result = await withMigrationItemTracking({
			ctx: contexts.create({}),
			migrationInternalId: "mig_test",
			migrationRunId: "mrun_test",
			item: { kind: "customer", internal_id: "cus_internal", id: "cus_1" },
			dryRun: false,
			run: async () => {
				throw poolTimeout();
			},
		});

		expect(result).toBeUndefined();
		expect(skipWrites).toBe(2);
	});
});
