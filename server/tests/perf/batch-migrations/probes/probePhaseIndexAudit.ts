/**
 * Index audit for the candidate select + entitlement insert: EXPLAIN
 * (ANALYZE, BUFFERS) the exact production SQL — unconstrained AND
 * operation-scope-constrained — and print EVERY scan node with its index,
 * flagging any Seq Scan on real tables (prod tables are unbounded — every
 * per-row probe must be an index scan). Insert explains run inside a
 * rolled-back transaction, so no rows persist.
 *
 *   bun tests/perf/batch-migrations/probes/probePhaseIndexAudit.ts
 */

import type { EntitlementWithFeature } from "@autumn/shared";
import { EntInterval, entitlements } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { and, eq, type SQL, sql } from "drizzle-orm";
import { computeCustomerEntitlementInitialState } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import {
	buildInsertCustomerEntitlementRowsQuery,
	type InsertableCustomerEntitlementRow,
} from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/insertCustomerEntitlementRows.js";
import {
	buildAddCandidateRowsQuery,
	selectAddCandidateRows,
} from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/selectAddCandidateRows.js";
import {
	buildOperationScope,
	type OperationScope,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import { generateId } from "@/utils/genUtils.js";
import {
	BENCH_FREE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const PAGE_SIZE = 5000;

type PlanNode = {
	"Node Type": string;
	"Relation Name"?: string;
	"Index Name"?: string;
	"Actual Rows"?: number;
	"Actual Loops"?: number;
	"Actual Total Time"?: number;
	Plans?: PlanNode[];
};

const walkScans = (node: PlanNode, out: string[]) => {
	const isScan =
		node["Node Type"].includes("Scan") || node["Node Type"] === "Materialize";
	if (isScan && node["Relation Name"]) {
		const loops = node["Actual Loops"] ?? 1;
		const rows = (node["Actual Rows"] ?? 0) * loops;
		const totalMs = Math.round((node["Actual Total Time"] ?? 0) * loops);
		const seq = node["Node Type"].includes("Seq Scan");
		out.push(
			`${seq ? "⚠️ SEQ " : "  "} ${node["Node Type"]} on ${node["Relation Name"]}` +
				`${node["Index Name"] ? ` [${node["Index Name"]}]` : ""}` +
				` — ${rows.toLocaleString()} rows, ${loops.toLocaleString()} loops, ~${totalMs}ms`,
		);
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

	const explain = async (label: string, query: SQL) => {
		const planRows = (await db.execute(
			sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
		)) as Record<string, unknown>[];
		const raw = Object.values(planRows[0])[0];
		const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
			Plan: PlanNode;
			"Execution Time": number;
		}[];
		console.log(`\n■ ${label} — ${Math.round(parsed[0]["Execution Time"])}ms`);
		const scans: string[] = [];
		walkScans(parsed[0].Plan, scans);
		for (const scan of scans) console.log(`  ${scan}`);
	};

	const paidSubIds = await resolvePage({
		planId: BENCH_PAID_PRODUCT_ID,
		cursor: "cus_bench_3600000",
	});
	const siblingIds = await resolvePage({ planId: BENCH_FREE_PRODUCT_ID });

	await explain(
		"candidates: paid-sub rung (all laterals firing)",
		buildAddCandidateRowsQuery({
			internalCustomerIds: paidSubIds,
			scope: buildOperationScope({
				internalProductId: benchProducts.paid.internalId,
			}),
			entitlement: wordsEntitlement,
			includeAnchorSources: true,
		}),
	);
	await explain(
		"candidates: sibling rung (cusEnt lateral firing)",
		buildAddCandidateRowsQuery({
			internalCustomerIds: siblingIds,
			scope: buildOperationScope({
				internalProductId: benchProducts.free.internalId,
			}),
			entitlement: wordsEntitlement,
			includeAnchorSources: true,
		}),
	);
	await explain(
		"candidates: boolean (no anchor sources)",
		buildAddCandidateRowsQuery({
			internalCustomerIds: siblingIds,
			scope: buildOperationScope({
				internalProductId: benchProducts.free.internalId,
			}),
			entitlement: wordsEntitlement,
			includeAnchorSources: false,
		}),
	);

	// ── operation-scope constraint variants ────────────────────────────────
	const customRangeIds = await resolvePage({
		planId: BENCH_FREE_PRODUCT_ID,
		cursor: "cus_bench_4000001",
	});
	const stackedPaidScope: Partial<OperationScope> = {
		isCustom: false,
		isPaid: true,
		isRecurring: true,
		hasBasePrice: true,
	};

	await explain(
		"candidates: scope custom:false (bench-free mixed-custom page)",
		buildAddCandidateRowsQuery({
			internalCustomerIds: customRangeIds,
			scope: buildOperationScope({
				internalProductId: benchProducts.free.internalId,
				isCustom: false,
			}),
			entitlement: wordsEntitlement,
			includeAnchorSources: true,
		}),
	);
	await explain(
		"candidates: scope stacked (bench-paid custom:false+paid+recurring+base)",
		buildAddCandidateRowsQuery({
			internalCustomerIds: paidSubIds,
			scope: buildOperationScope({
				internalProductId: benchProducts.paid.internalId,
				...stackedPaidScope,
			}),
			entitlement: wordsEntitlement,
			includeAnchorSources: true,
		}),
	);

	// ── insert (scope re-assertion join) — rolled back, nothing persists ───
	// Needs the prepared words entitlement rows a benchRunMigration run
	// materializes; refuse loudly rather than explain against fake FK ids.
	const preparedEntitlement = async ({
		internalProductId,
	}: {
		internalProductId: string;
	}): Promise<EntitlementWithFeature> => {
		const [row] = await db
			.select()
			.from(entitlements)
			.where(
				and(
					eq(entitlements.internal_product_id, internalProductId),
					eq(entitlements.feature_id, TestFeature.Words),
				),
			)
			.limit(1);
		if (!row)
			throw new Error(
				"bench: no prepared words entitlement — run benchRunMigration once for this plan first",
			);
		return {
			...row,
			feature: wordsFeature,
		} as unknown as EntitlementWithFeature;
	};

	const explainInsertRolledBack = async ({
		label,
		internalCustomerIds,
		scope,
	}: {
		label: string;
		internalCustomerIds: string[];
		scope: OperationScope;
	}) => {
		const entitlement = await preparedEntitlement({
			internalProductId: scope.internalProductId,
		});
		const candidates = await selectAddCandidateRows({
			db,
			internalCustomerIds,
			scope,
			entitlement,
			includeAnchorSources: false,
		});
		if (candidates.length === 0) {
			console.log(`\n■ ${label} — SKIPPED (0 candidates; already added?)`);
			return;
		}
		const rows: InsertableCustomerEntitlementRow[] = candidates.map(
			(candidate) => ({
				...candidate,
				resetCycleAnchor: null,
				nextResetAt: null,
				id: generateId("cus_ent"),
			}),
		);
		const query = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${buildInsertCustomerEntitlementRowsQuery(
			{
				scope,
				entitlement,
				initialState: computeCustomerEntitlementInitialState({ entitlement }),
				rows,
				now: Date.now(),
			},
		)}`;

		const rollback = new Error("bench-rollback");
		let planRows: Record<string, unknown>[] = [];
		try {
			await db.transaction(async (transaction) => {
				planRows = (await transaction.execute(query)) as unknown as Record<
					string,
					unknown
				>[];
				throw rollback;
			});
		} catch (error) {
			if (error !== rollback) throw error;
		}
		const raw = Object.values(planRows[0])[0];
		const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
			Plan: PlanNode;
			"Execution Time": number;
		}[];
		console.log(
			`\n■ ${label} — ${Math.round(parsed[0]["Execution Time"])}ms (${rows.length.toLocaleString()} rows, rolled back)`,
		);
		const scans: string[] = [];
		walkScans(parsed[0].Plan, scans);
		for (const scan of scans) console.log(`  ${scan}`);
	};

	await explainInsertRolledBack({
		label: "insert: unconstrained scope (bench-paid page)",
		internalCustomerIds: paidSubIds,
		scope: buildOperationScope({
			internalProductId: benchProducts.paid.internalId,
		}),
	});
	await explainInsertRolledBack({
		label: "insert: stacked scope re-assertion (bench-paid page)",
		internalCustomerIds: paidSubIds,
		scope: buildOperationScope({
			internalProductId: benchProducts.paid.internalId,
			...stackedPaidScope,
		}),
	});

	console.log("\n── indexes on touched tables ─────────────────");
	const indexRows = (await db.execute(sql`
		SELECT tablename, indexname, indexdef FROM pg_indexes
		WHERE tablename IN ('customer_prices', 'subscriptions', 'customer_entitlements')
		ORDER BY tablename, indexname
	`)) as { tablename: string; indexname: string; indexdef: string }[];
	for (const row of indexRows)
		console.log(`${row.tablename}: ${row.indexname}`);
	process.exit(0);
};

await main();
