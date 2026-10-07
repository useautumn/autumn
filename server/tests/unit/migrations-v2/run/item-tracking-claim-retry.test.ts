// Contract: a customer whose claim cannot get a DB connection is retried, never dropped.
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { withMigrationItemTracking } from "@/internal/migrations/v2/actions/migrationItem/withMigrationItemTracking.js";
import {
	migrationItemEventRepo,
	migrationItemRunRepo,
} from "@/internal/migrations/v2/repos/index.js";

const poolTimeout = () => new Error("timeout exceeded when trying to connect");

describe("withMigrationItemTracking claim acquisition", () => {
	const spies: { mockRestore: () => void }[] = [];
	afterEach(() => {
		for (const spy of spies.splice(0)) spy.mockRestore();
	});

	test("retries the claim after a connection timeout and then runs the customer", async () => {
		let claims = 0;
		let runs = 0;
		spies.push(
			spyOn(migrationItemRunRepo, "claim").mockImplementation(async () => {
				claims++;
				if (claims === 1) throw poolTimeout();
				return { claimed: true, itemRun: undefined } as never;
			}),
			spyOn(migrationItemRunRepo, "markSucceeded").mockImplementation(
				async () => undefined as never,
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
			claimItemRun: true,
			run: async () => {
				runs++;
				return { itemPreview: null, status: "succeeded", response: {} };
			},
		});

		expect(claims).toBe(2);
		expect(runs).toBe(1);
		expect(result?.status).toBe("succeeded");
	});
});
