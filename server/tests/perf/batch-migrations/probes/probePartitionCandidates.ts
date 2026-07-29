/**
 * Read-only phase probe for the batch page's partition query and candidate
 * select, per anchor-ladder rung. Pages are resolved via the real claim
 * select; cursors steer pages onto specific seeded shape ranges.
 *
 *   bun tests/perf/batch-migrations/probes/probePartitionCandidates.ts
 */

import type { EntitlementWithFeature } from "@autumn/shared";
import { EntInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { sql } from "drizzle-orm";
import { listCustomersOnPlanFilterMatchedProducts } from "@/internal/migrations/v2/batchOperations/repos/listCustomersOnPlanFilterMatchedProducts.js";
import { selectAddCandidateRows } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/selectAddCandidateRows.js";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import {
	BENCH_FREE_BARE_PRODUCT_ID,
	BENCH_FREE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const PAGE_SIZE = 5000;

const main = async () => {
	const bench = await getBenchContext();
	const { ctx, benchProducts } = bench;
	const { db } = ctx;

	const wordsFeature = ctx.features.find((f) => f.id === TestFeature.Words);
	const messagesFeature = ctx.features.find(
		(f) => f.id === TestFeature.Messages,
	);
	const dashboardFeature = ctx.features.find(
		(f) => f.id === TestFeature.Dashboard,
	);
	if (!wordsFeature || !messagesFeature || !dashboardFeature)
		throw new Error("bench features missing");

	const monthlyEntitlement = (feature: typeof wordsFeature) =>
		({
			interval: EntInterval.Month,
			interval_count: 1,
			internal_feature_id: feature.internal_id,
			feature_id: feature.id,
			feature,
		}) as unknown as EntitlementWithFeature;
	const booleanEntitlement = {
		interval: null,
		interval_count: null,
		internal_feature_id: dashboardFeature.internal_id,
		feature_id: dashboardFeature.id,
		feature: dashboardFeature,
	} as unknown as EntitlementWithFeature;

	const resolvePage = async ({
		planId,
		cursor,
	}: {
		planId: string;
		cursor?: string;
	}): Promise<string[]> => {
		const rows = (await db.execute(
			buildCustomerSelect({
				orgId: ctx.org.id,
				env: ctx.env,
				filter: { plan: { plan_id: planId } },
				ctx: { features: ctx.features },
				limit: PAGE_SIZE,
				afterInternalId: cursor,
			}),
		)) as { internal_id: string }[];
		return rows.map((row) => row.internal_id);
	};

	const scenarios: {
		key: string;
		planId: string;
		productInternalId: string;
		cursor?: string;
		entitlement: EntitlementWithFeature;
		includeAnchorSources: boolean;
	}[] = [
		{
			key: "paid-now rung (words)",
			planId: BENCH_PAID_PRODUCT_ID,
			productInternalId: benchProducts.paid.internalId,
			entitlement: monthlyEntitlement(wordsFeature),
			includeAnchorSources: true,
		},
		{
			key: "paid-sub rung (words, UNNEST lateral hits)",
			planId: BENCH_PAID_PRODUCT_ID,
			productInternalId: benchProducts.paid.internalId,
			cursor: "cus_bench_3600000",
			entitlement: monthlyEntitlement(wordsFeature),
			includeAnchorSources: true,
		},
		{
			key: "sibling rung (words on bench-free)",
			planId: BENCH_FREE_PRODUCT_ID,
			productInternalId: benchProducts.free.internalId,
			entitlement: monthlyEntitlement(wordsFeature),
			includeAnchorSources: true,
		},
		{
			key: "custom range (partition should exclude)",
			planId: BENCH_FREE_PRODUCT_ID,
			productInternalId: benchProducts.free.internalId,
			cursor: "cus_bench_4000001",
			entitlement: monthlyEntitlement(wordsFeature),
			includeAnchorSources: true,
		},
		{
			key: "starts_at rung (free-bare)",
			planId: BENCH_FREE_BARE_PRODUCT_ID,
			productInternalId: benchProducts.freeBare.internalId,
			entitlement: monthlyEntitlement(wordsFeature),
			includeAnchorSources: true,
		},
		{
			key: "cp-anchor rung (free-bare deep)",
			planId: BENCH_FREE_BARE_PRODUCT_ID,
			productInternalId: benchProducts.freeBare.internalId,
			cursor: "cus_bench_3200000",
			entitlement: monthlyEntitlement(wordsFeature),
			includeAnchorSources: true,
		},
		{
			key: "boolean add (dashboard — no anchor sources)",
			planId: BENCH_FREE_PRODUCT_ID,
			productInternalId: benchProducts.free.internalId,
			entitlement: booleanEntitlement,
			includeAnchorSources: false,
		},
		{
			key: "dedup no-op (messages already exist on bench-free)",
			planId: BENCH_FREE_PRODUCT_ID,
			productInternalId: benchProducts.free.internalId,
			entitlement: monthlyEntitlement(messagesFeature),
			includeAnchorSources: true,
		},
	];

	for (const scenario of scenarios) {
		const ids = await resolvePage({
			planId: scenario.planId,
			cursor: scenario.cursor,
		});
		console.log(
			`\n■ ${scenario.key} — page of ${ids.length.toLocaleString()} (${ids[0]} ..)`,
		);
		if (ids.length === 0) continue;

		for (let run = 1; run <= 2; run++) {
			const partitionStarted = Date.now();
			const matched = await listCustomersOnPlanFilterMatchedProducts({
				db,
				internalCustomerIds: ids,
				planFilterMatchedProductIds: [scenario.productInternalId],
			});
			console.log(
				`  partition ${run}: ${matched.size.toLocaleString()} matched in ${Date.now() - partitionStarted}ms`,
			);
		}

		for (let run = 1; run <= 2; run++) {
			const candidateStarted = Date.now();
			const candidates = await selectAddCandidateRows({
				db,
				internalCustomerIds: ids,
				fromInternalProductId: scenario.productInternalId,
				entitlement: scenario.entitlement,
				includeAnchorSources: scenario.includeAnchorSources,
			});
			const withSub = candidates.filter(
				(candidate) => candidate.subscriptionCycleAnchor !== null,
			).length;
			const withSibling = candidates.filter(
				(candidate) => candidate.siblingResetCycleAnchor !== null,
			).length;
			console.log(
				`  candidates ${run}: ${candidates.length.toLocaleString()} rows in ${Date.now() - candidateStarted}ms (subAnchor=${withSub.toLocaleString()}, sibling=${withSibling.toLocaleString()})`,
			);
		}
	}
	process.exit(0);
};

await main();
