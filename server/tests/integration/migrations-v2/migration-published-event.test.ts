import { expect, test } from "bun:test";
import type { ItemRunToPublish } from "@/internal/migrations/v2/batchOperations/execute/claim/listItemRunsToPublish.js";
import { itemRunsToPageResult } from "@/internal/migrations/v2/batchOperations/itemChanges/itemRunsToPageResult.js";

test("a publisher that reloads an already-published success does not produce an empty success event", async () => {
	const customer = {
		internalId: "customer_123",
		id: "public_123",
		name: null,
		email: null,
	};
	const snapshot: ItemRunToPublish = {
		customer,
		migrationRunId: "run_123",
		status: "succeeded",
		skipReason: null,
		changes: null,
	};
	const alreadyPublished = await itemRunsToPageResult({
		itemRuns: [snapshot],
	});
	expect(alreadyPublished.succeeded).toEqual([]);
	const pending = await itemRunsToPageResult({
		itemRuns: [{ ...snapshot, changes: [{ kind: "license_pool_repointed" }] }],
	});
	expect(pending.succeeded).toEqual([customer]);
});
