import { expect } from "bun:test";
import type { ApiCustomerV5, Migration } from "@autumn/shared";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import { TestFeature } from "@tests/setup/v2Features";
import type { MigrationChunkRunResult } from "@/internal/migrations/v2/run/chunks/iterateMigrationChunks.js";
import { runChunkedMigration } from "../../utils/runChunkedMigration";

export const WORDS_PER_ROW = 10;

export const addWordsOperation = ({
	planFilter,
}: {
	planFilter: PlanFilter;
}) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: planFilter,
			customize: {
				add_items: [{ feature_id: TestFeature.Words, included: WORDS_PER_ROW }],
			},
		},
	],
});

export const runScopedMigration = async ({
	ctx,
	migrationClient,
	migrationId,
	planFilter,
	customerFilter,
	expectedLane = "batch",
}: {
	// biome-ignore lint/suspicious/noExplicitAny: scenario ctx/client passthrough
	ctx: any;
	// biome-ignore lint/suspicious/noExplicitAny: scenario ctx/client passthrough
	migrationClient: any;
	migrationId: string;
	planFilter: PlanFilter;
	customerFilter?: PlanFilter;
	expectedLane?: MigrationChunkRunResult["lane"];
}): Promise<{ migration: Migration; migrationRunId: string }> => {
	const { migration, migrationRunId, result } = await runChunkedMigration({
		ctx,
		migrationClient,
		migrationId,
		filter: { customer: { plan: customerFilter ?? planFilter } },
		operations: addWordsOperation({ planFilter }),
		noBillingChanges: true,
	});
	expect(result?.lane).toBe(expectedLane);
	return { migration, migrationRunId };
};

export const expectWordsOnPlans = ({
	customer,
	planIds,
}: {
	customer: ApiCustomerV5;
	planIds: string[];
}) => {
	const balance = customer.balances[TestFeature.Words];
	if (planIds.length === 0) {
		expect(balance).toBeUndefined();
		return;
	}

	expect(balance).toBeDefined();
	const breakdownPlanIds = (balance.breakdown ?? [])
		.map((bucket) => bucket.plan_id)
		.sort();
	expect(breakdownPlanIds).toEqual([...planIds].sort());
	expect(balance.remaining).toBe(WORDS_PER_ROW * planIds.length);
};
