/**
 * U2 spike: validates the streaming candidate-source shape against the new
 * idx_customer_products_product_customer_c index BEFORE changing the
 * compiler. Read-only. For each scenario: EXPLAIN, timed runs, and row
 * parity (same ids, same order) vs today's buildCustomerSelect.
 *
 *   bun tests/perf/batch-migrations/probes/probeStreamingSpike.ts
 */

import { MigrationItemRunStatus } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import type { CustomerCheckpointExclusion } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import {
	BENCH_FREE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const PAGE_SIZE = 5000;
const MID_MIGRATION_ID = "probe_mig_mid";
const MID_CURSOR = "cus_bench_3500001";

type PlanNode = {
	"Node Type": string;
	"Relation Name"?: string;
	"Index Name"?: string;
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
	const label = `${node["Node Type"]}${node["Relation Name"] ? ` on ${node["Relation Name"]}` : ""}${node["Index Name"] ? ` [${node["Index Name"]}]` : ""}`;
	if (node["Node Type"].includes("Seq Scan")) {
		out.push(`SEQ   ${label}: ${rows.toLocaleString()} rows, ${ms}ms`);
	} else if (node["Disk Usage"] || node["Sort Method"]?.includes("external")) {
		out.push(`DISK  ${label}: ${rows.toLocaleString()} rows, ${ms}ms`);
	} else if (rows >= 50_000) {
		out.push(`BIG   ${label}: ${rows.toLocaleString()} rows, ${ms}ms`);
	}
	for (const child of node.Plans ?? []) walkOffenders(child, out);
};

const main = async () => {
	const { ctx } = await getBenchContext();
	const { db } = ctx;

	const streamingSelect = ({
		planIds,
		cursor,
		checkpointMigrationId,
	}: {
		planIds: string[];
		cursor?: string;
		checkpointMigrationId?: string;
	}): SQL => {
		const planIdList = sql.join(
			planIds.map((id) => sql`${id}`),
			sql`, `,
		);
		const cursorFilter = cursor
			? sql`AND cp.internal_customer_id COLLATE "C" < ${cursor}`
			: sql``;
		// The checkpoint anti-join keys on the customer internal id, which cp
		// already has — so it can live INSIDE the inner query, making the inner
		// LIMIT legal and the ordered index walk reachable.
		const checkpointFilter = checkpointMigrationId
			? sql`AND NOT EXISTS (
					SELECT 1 FROM migration_item_runs mir
					WHERE mir.migration_internal_id = ${checkpointMigrationId}
						AND mir.dry_run = false
						AND mir.item_kind = 'customer'
						AND mir.item_id = cp.internal_customer_id
						AND mir.status IN (${MigrationItemRunStatus.Succeeded}, ${MigrationItemRunStatus.Skipped}, ${MigrationItemRunStatus.Failed})
				)`
			: sql``;

		// One ordered index walk per plan product (equality pin → the walk is
		// order-guaranteed), each limited; merging k×page rows is trivial.
		return sql`
			SELECT c.internal_id, c.id, c.name, c.email
			FROM (
				SELECT DISTINCT ON (walk.internal_customer_id COLLATE "C")
					walk.internal_customer_id
				FROM (
					SELECT p.internal_id FROM products p
					WHERE p.org_id = ${ctx.org.id} AND p.env = ${ctx.env}
						AND p.id IN (${planIdList})
				) plans
				CROSS JOIN LATERAL (
					SELECT cp.internal_customer_id
					FROM customer_products cp
					WHERE cp.internal_product_id = plans.internal_id
						AND cp.status IN ('active', 'past_due', 'scheduled')
						${cursorFilter}
						${checkpointFilter}
					ORDER BY cp.internal_customer_id COLLATE "C" DESC
					LIMIT ${PAGE_SIZE}
				) walk
				ORDER BY walk.internal_customer_id COLLATE "C" DESC
				LIMIT ${PAGE_SIZE}
			) m
			JOIN customers c ON c.internal_id = m.internal_customer_id
			WHERE c.org_id = ${ctx.org.id} AND c.env = ${ctx.env}
			ORDER BY m.internal_customer_id COLLATE "C" DESC
		`;
	};

	const scenarios: {
		key: string;
		build: () => SQL;
		parity?: () => SQL;
	}[] = [
		{
			key: "stream-selective",
			build: () => streamingSelect({ planIds: [BENCH_PAID_PRODUCT_ID] }),
			parity: () =>
				buildCustomerSelect({
					orgId: ctx.org.id,
					env: ctx.env,
					filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID } },
					ctx: { features: ctx.features },
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "stream-dominant",
			build: () => streamingSelect({ planIds: [BENCH_FREE_PRODUCT_ID] }),
			parity: () =>
				buildCustomerSelect({
					orgId: ctx.org.id,
					env: ctx.env,
					filter: { plan: { plan_id: BENCH_FREE_PRODUCT_ID } },
					ctx: { features: ctx.features },
					limit: PAGE_SIZE,
				}),
		},
		{
			key: "stream-multiplan",
			build: () =>
				streamingSelect({
					planIds: [BENCH_PAID_PRODUCT_ID, BENCH_FREE_PRODUCT_ID],
				}),
		},
		{
			key: "stream-midrun-cursor",
			build: () =>
				streamingSelect({
					planIds: [BENCH_PAID_PRODUCT_ID],
					cursor: MID_CURSOR,
					checkpointMigrationId: MID_MIGRATION_ID,
				}),
			parity: () =>
				buildCustomerSelect({
					orgId: ctx.org.id,
					env: ctx.env,
					filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID } },
					ctx: { features: ctx.features },
					checkpoint: midCheckpoint,
					limit: PAGE_SIZE,
					afterInternalId: MID_CURSOR,
				}),
		},
		{
			key: "stream-deep-cursor",
			build: () =>
				streamingSelect({
					planIds: [BENCH_FREE_PRODUCT_ID],
					cursor: "cus_bench_1100000",
				}),
			parity: () =>
				buildCustomerSelect({
					orgId: ctx.org.id,
					env: ctx.env,
					filter: { plan: { plan_id: BENCH_FREE_PRODUCT_ID } },
					ctx: { features: ctx.features },
					limit: PAGE_SIZE,
					afterInternalId: "cus_bench_1100000",
				}),
		},
	];

	const midCheckpoint: CustomerCheckpointExclusion = {
		migrationInternalId: MID_MIGRATION_ID,
		migrationRunId: "probe_run_spike",
		dryRun: false,
		excludedStatuses: [
			MigrationItemRunStatus.Succeeded,
			MigrationItemRunStatus.Skipped,
			MigrationItemRunStatus.Failed,
		],
	};

	for (const scenario of scenarios) {
		console.log(`\n■ ${scenario.key}`);
		const planRows = (await db.execute(
			sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${scenario.build()}`,
		)) as Record<string, unknown>[];
		const raw = Object.values(planRows[0])[0];
		const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
			Plan: PlanNode;
			"Execution Time": number;
		}[];
		console.log(`  explain: ${Math.round(parsed[0]["Execution Time"])}ms`);
		const offenders: string[] = [];
		walkOffenders(parsed[0].Plan, offenders);
		for (const offender of offenders) console.log(`  ${offender}`);
		if (offenders.length === 0) console.log("  (no offenders — pipelined)");

		for (let run = 1; run <= 2; run++) {
			const started = Date.now();
			const rows = (await db.execute(scenario.build())) as {
				internal_id: string;
			}[];
			console.log(
				`  timed ${run}: ${rows.length.toLocaleString()} rows in ${Date.now() - started}ms (${rows[0]?.internal_id} .. ${rows[rows.length - 1]?.internal_id})`,
			);
		}

		if (scenario.parity) {
			const [newRows, oldRows] = (await Promise.all([
				db.execute(scenario.build()),
				db.execute(scenario.parity()),
			])) as { internal_id: string }[][];
			const same =
				newRows.length === oldRows.length &&
				newRows.every(
					(row, index) => row.internal_id === oldRows[index].internal_id,
				);
			console.log(
				same
					? `  parity: OK (${newRows.length.toLocaleString()} rows identical + same order)`
					: `  parity: MISMATCH new=${newRows.length} old=${oldRows.length} firstNew=${newRows[0]?.internal_id} firstOld=${oldRows[0]?.internal_id}`,
			);
		}
	}
	process.exit(0);
};

await main();
