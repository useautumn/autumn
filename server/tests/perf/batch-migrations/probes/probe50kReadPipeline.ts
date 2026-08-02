/**
 * End-to-end read pipeline at 50k page size: claim select → partition →
 * candidate select, timed with plan-scan summaries. Read-only.
 *
 *   bun tests/perf/batch-migrations/probes/probe50kReadPipeline.ts
 */

import type { EntitlementWithFeature } from "@autumn/shared";
import { EntInterval, MigrationItemRunStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { type SQL, sql } from "drizzle-orm";
import { buildAddCandidateRowsQuery } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/selectAddCandidateRows.js";
import { buildOperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import {
	BENCH_FREE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const PAGE_SIZE = 50_000;

type PlanNode = {
	"Node Type": string;
	"Relation Name"?: string;
	"Index Name"?: string;
	"Actual Rows"?: number;
	"Actual Loops"?: number;
	Plans?: PlanNode[];
};

const walkScans = (node: PlanNode, out: string[]) => {
	if (node["Relation Name"]) {
		const loops = node["Actual Loops"] ?? 1;
		const rows = (node["Actual Rows"] ?? 0) * loops;
		if (loops > 0) {
			out.push(
				`${node["Node Type"].includes("Seq Scan") ? "⚠️ SEQ " : "  "}${node["Node Type"]} on ${node["Relation Name"]}${node["Index Name"] ? ` [${node["Index Name"]}]` : ""} — ${rows.toLocaleString()} rows × ${loops.toLocaleString()} loops`,
			);
		}
	}
	for (const child of node.Plans ?? []) walkScans(child, out);
};

const main = async () => {
	const bench = await getBenchContext();
	const { ctx, benchProducts } = bench;
	const { db } = ctx;

	const wordsFeature = ctx.features.find((f) => f.id === TestFeature.Words);
	if (!wordsFeature) throw new Error("words feature missing");
	const wordsEntitlement = {
		interval: EntInterval.Month,
		interval_count: 1,
		internal_feature_id: wordsFeature.internal_id,
		feature_id: wordsFeature.id,
		feature: wordsFeature,
	} as unknown as EntitlementWithFeature;

	const explainScans = async (query: SQL): Promise<string[]> => {
		const planRows = (await db.execute(
			sql`EXPLAIN (ANALYZE, FORMAT JSON) ${query}`,
		)) as Record<string, unknown>[];
		const raw = Object.values(planRows[0])[0];
		const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
			Plan: PlanNode;
		}[];
		const scans: string[] = [];
		walkScans(parsed[0].Plan, scans);
		return scans;
	};

	for (const scenario of [
		{
			key: "bench-paid (paid-now + paid-sub rungs)",
			planId: BENCH_PAID_PRODUCT_ID,
			productInternalId: benchProducts.paid.internalId,
		},
		{
			key: "bench-free (sibling rung)",
			planId: BENCH_FREE_PRODUCT_ID,
			productInternalId: benchProducts.free.internalId,
		},
	]) {
		console.log(
			`\n═══ ${scenario.key} — page size ${PAGE_SIZE.toLocaleString()} ═══`,
		);

		// 1. claim select
		const claimQuery = () =>
			buildCustomerSelect({
				orgId: ctx.org.id,
				env: ctx.env,
				filter: { plan: { plan_id: scenario.planId } },
				ctx: { features: ctx.features },
				checkpoint: {
					migrationInternalId: "probe_mig_none",
					migrationRunId: "probe_run_none",
					dryRun: false,
					excludedStatuses: [
						MigrationItemRunStatus.Succeeded,
						MigrationItemRunStatus.Skipped,
						MigrationItemRunStatus.Failed,
					],
				},
				limit: PAGE_SIZE,
			});
		const claimStarted = Date.now();
		const claimed = (await db.execute(claimQuery())) as {
			internal_id: string;
		}[];
		console.log(
			`1. claim select: ${claimed.length.toLocaleString()} rows in ${Date.now() - claimStarted}ms (${claimed[0]?.internal_id} .. ${claimed[claimed.length - 1]?.internal_id})`,
		);
		const ids = claimed.map((row) => row.internal_id);

		// 3. candidate select
		const candidateQuery = buildAddCandidateRowsQuery({
			internalCustomerIds: ids,
			scope: buildOperationScope({
				internalProductId: scenario.productInternalId,
			}),
			entitlement: wordsEntitlement,
			includeAnchorSources: true,
		});
		const candidateStarted = Date.now();
		const candidates = (await db.execute(candidateQuery)) as {
			subscription_cycle_anchor: unknown;
			sibling_reset_cycle_anchor: unknown;
		}[];
		const withSub = candidates.filter(
			(row) => row.subscription_cycle_anchor !== null,
		).length;
		const withSibling = candidates.filter(
			(row) => row.sibling_reset_cycle_anchor !== null,
		).length;
		console.log(
			`3. candidates: ${candidates.length.toLocaleString()} rows in ${Date.now() - candidateStarted}ms (subAnchor=${withSub.toLocaleString()}, sibling=${withSibling.toLocaleString()})`,
		);
		for (const scan of await explainScans(candidateQuery))
			console.log(`   ${scan}`);
	}
	process.exit(0);
};

await main();
