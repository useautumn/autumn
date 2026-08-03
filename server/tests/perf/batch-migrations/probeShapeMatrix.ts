/**
 * U0 baseline matrix: every migration read-query shape (claim page, dashboard
 * preview page, count, execution view) probed read-only against the 4M bench
 * org. Prints per-scenario timings + plan offenders (seq scans, >=100k-row
 * nodes, disk spills); full EXPLAIN JSON saved under results/.
 *
 *   bun tests/perf/batch-migrations/probeShapeMatrix.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CustomerFilter } from "@autumn/shared";
import { MigrationItemRunStatus } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import {
	buildCustomerCount,
	buildCustomerSelect,
	buildProcessedPreviewCount,
	buildProcessedPreviewSelect,
	type CustomerCheckpointExclusion,
} from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import {
	BENCH_FREE_BARE_PRODUCT_ID,
	BENCH_FREE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "./utils/benchContext.js";

const PAGE_SIZE = 5000;
const DASHBOARD_PAGE_SIZE = 51;
const MID_MIGRATION_ID = "probe_mig_mid";
const MID_CURSOR = "cus_bench_3500001";
const RESULTS_DIR = join(import.meta.dir, "results");

type PlanNode = {
	"Node Type": string;
	"Relation Name"?: string;
	"Actual Rows"?: number;
	"Actual Loops"?: number;
	"Actual Total Time"?: number;
	"Sort Method"?: string;
	"Disk Usage"?: number;
	Plans?: PlanNode[];
};

const walkOffenders = (node: PlanNode, out: string[]) => {
	const rows = (node["Actual Rows"] ?? 0) * (node["Actual Loops"] ?? 1);
	const ms = Math.round(node["Actual Total Time"] ?? 0);
	const label = `${node["Node Type"]}${node["Relation Name"] ? ` on ${node["Relation Name"]}` : ""}`;
	if (node["Node Type"].includes("Seq Scan")) {
		out.push(`SEQ   ${label}: ${rows.toLocaleString()} rows, ${ms}ms`);
	} else if (node["Disk Usage"] || node["Sort Method"]?.includes("external")) {
		out.push(
			`DISK  ${label}: ${rows.toLocaleString()} rows, ${ms}ms, ${node["Disk Usage"] ?? "?"}kB spilled`,
		);
	} else if (rows >= 100_000) {
		out.push(`BIG   ${label}: ${rows.toLocaleString()} rows, ${ms}ms`);
	}
	for (const child of node.Plans ?? []) walkOffenders(child, out);
};

const main = async () => {
	const { ctx } = await getBenchContext();
	const { db } = ctx;
	mkdirSync(RESULTS_DIR, { recursive: true });

	const [versionRow] = (await db.execute(
		sql`SELECT version() AS v, current_setting('work_mem') AS work_mem`,
	)) as { v: string; work_mem: string }[];
	console.log(`pg: ${versionRow.v}`);
	console.log(`pg: work_mem=${versionRow.work_mem}`);

	const filterCtx = { features: ctx.features };
	const base = { orgId: ctx.org.id, env: ctx.env, ctx: filterCtx };
	const freshCheckpoint: CustomerCheckpointExclusion = {
		migrationInternalId: "probe_mig_none",
		migrationRunId: "probe_run_none",
		dryRun: false,
		excludedStatuses: [
			MigrationItemRunStatus.Succeeded,
			MigrationItemRunStatus.Skipped,
			MigrationItemRunStatus.Failed,
		],
	};
	const midCheckpoint: CustomerCheckpointExclusion = {
		...freshCheckpoint,
		migrationInternalId: MID_MIGRATION_ID,
	};

	const paid: CustomerFilter = { plan: { plan_id: BENCH_PAID_PRODUCT_ID } };
	const free: CustomerFilter = { plan: { plan_id: BENCH_FREE_PRODUCT_ID } };
	const multi: CustomerFilter = {
		plan: {
			plan_id: { $in: [BENCH_PAID_PRODUCT_ID, BENCH_FREE_BARE_PRODUCT_ID] },
		},
	};
	const freeNonCustom: CustomerFilter = {
		plan: { plan_id: BENCH_FREE_PRODUCT_ID, custom: false },
	};
	const paidDerived: CustomerFilter = {
		plan: { plan_id: BENCH_PAID_PRODUCT_ID, paid: true },
	};
	const paidRecurring: CustomerFilter = {
		plan: { plan_id: BENCH_PAID_PRODUCT_ID, recurring: true },
	};
	const paidBasePrice: CustomerFilter = {
		plan: { plan_id: BENCH_PAID_PRODUCT_ID, price: { $ne: null } },
	};
	const freeUnpaidResidual: CustomerFilter = {
		plan: { plan_id: BENCH_FREE_PRODUCT_ID, custom: false, paid: false },
	};

	const scenarios: { key: string; note: string; build: () => SQL }[] = [
		{
			key: "S1-claim-selective",
			note: "claim page, bench-paid (600k matched), fresh, no cursor",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: paid,
					checkpoint: freshCheckpoint,
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "S2-claim-dominant",
			note: "claim page, bench-free (2.4M matched), fresh, no cursor",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: free,
					checkpoint: freshCheckpoint,
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "S3-claim-multiplan",
			note: "claim page, plan_id $in [paid, free-bare] (1.6M matched)",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: multi,
					checkpoint: freshCheckpoint,
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "S4-claim-residual",
			note: "claim page, bench-free + custom:false (prod screenshot shape)",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: freeNonCustom,
					checkpoint: freshCheckpoint,
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "S5-claim-deep-cursor",
			note: "claim page, bench-free, cursor deep at cus_bench_1100000",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: free,
					checkpoint: freshCheckpoint,
					limit: PAGE_SIZE,
					afterInternalId: "cus_bench_1100000",
				}),
		},
		{
			key: "S6-claim-midrun-cursor",
			note: "claim page, bench-paid, 300k processed, resume cursor",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: paid,
					checkpoint: midCheckpoint,
					limit: PAGE_SIZE,
					afterInternalId: MID_CURSOR,
				}),
		},
		{
			key: "S7-claim-midrun-restart",
			note: "claim page, bench-paid, 300k processed, NO cursor (restart)",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: paid,
					checkpoint: midCheckpoint,
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "S8-claim-paid-derived",
			note: "claim page, bench-paid + paid:true (EXISTS cusPrice per row)",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: paidDerived,
					checkpoint: freshCheckpoint,
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "S9-claim-recurring",
			note: "claim page, bench-paid + recurring:true (EXISTS + prices join)",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: paidRecurring,
					checkpoint: freshCheckpoint,
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "S10-claim-base-price",
			note: "claim page, bench-paid + price:{$ne:null} (base-price subquery)",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: paidBasePrice,
					checkpoint: freshCheckpoint,
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "S11-claim-unpaid-residual",
			note: "claim page, bench-free + custom:false + paid:false (NOT EXISTS over dominant plan)",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: freeUnpaidResidual,
					checkpoint: freshCheckpoint,
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "P1-dashboard-page",
			note: "dashboard preview page, bench-free, limit 51",
			build: () =>
				buildCustomerSelect({
					...base,
					filter: free,
					limit: DASHBOARD_PAGE_SIZE,
				}),
		},
		{
			key: "C1-count-selective",
			note: "dashboard count, bench-paid (600k)",
			build: () => buildCustomerCount({ ...base, filter: paid }),
		},
		{
			key: "C2-count-dominant",
			note: "dashboard count, bench-free (2.4M)",
			build: () => buildCustomerCount({ ...base, filter: free }),
		},
		{
			key: "C3-count-recurring",
			note: "dashboard count, bench-paid + recurring:true (600k, EXISTS per row)",
			build: () => buildCustomerCount({ ...base, filter: paidRecurring }),
		},
		{
			key: "E1-execution-page",
			note: "execution view page (UNION), bench-paid + 300k processed, limit 51",
			build: () =>
				buildProcessedPreviewSelect({
					...base,
					filter: paid,
					includeProcessed: { migrationInternalId: MID_MIGRATION_ID },
					limit: DASHBOARD_PAGE_SIZE,
				}),
		},
		{
			key: "E2-execution-count",
			note: "execution view count (UNION), bench-paid + 300k processed",
			build: () =>
				buildProcessedPreviewCount({
					...base,
					filter: paid,
					includeProcessed: { migrationInternalId: MID_MIGRATION_ID },
				}),
		},
	];

	const summary: string[] = [];
	for (const scenario of scenarios) {
		const explainStarted = Date.now();
		const planRows = (await db.execute(
			sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${scenario.build()}`,
		)) as Record<string, unknown>[];
		const raw = Object.values(planRows[0])[0];
		const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
			Plan: PlanNode;
			"Execution Time": number;
		}[];
		writeFileSync(
			join(RESULTS_DIR, `${scenario.key}.json`),
			JSON.stringify(parsed, null, 2),
		);

		const timedStarted = Date.now();
		const rows = (await db.execute(scenario.build())) as unknown[];
		const timedMs = Date.now() - timedStarted;

		const offenders: string[] = [];
		walkOffenders(parsed[0].Plan, offenders);
		const line = `${scenario.key}: ${timedMs}ms (explain ${Math.round(parsed[0]["Execution Time"])}ms, analyze wall ${Date.now() - explainStarted - timedMs}ms) — ${rows.length.toLocaleString()} rows`;
		summary.push(line);
		console.log(`\n■ ${line}`);
		console.log(`  ${scenario.note}`);
		for (const offender of offenders) console.log(`  ${offender}`);
	}

	console.log("\n── summary ──────────────────────────────────────");
	for (const line of summary) console.log(line);
	process.exit(0);
};

await main();
