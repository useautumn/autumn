/**
 * Membership-accuracy probe: for every filter shape, diffs the legacy
 * materializing query (ground truth, buildCustomerSelect without limit)
 * against the paged walk (buildCustomerSelect with a full-set limit) —
 * DB-side, EXCEPT ALL both directions, so missing rows, extra rows, and
 * duplicates all surface. Also validates page iteration integrity.
 *
 *   bun tests/perf/batch-migrations/probes/probeFilterParity.ts
 */

import type { CustomerFilter } from "@autumn/shared";
import { MigrationItemRunStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { sql } from "drizzle-orm";
import type { CustomerCheckpointExclusion } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import {
	BENCH_FREE_BARE_PRODUCT_ID,
	BENCH_FREE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const FULL_SET_LIMIT = 10_000_000;
const PAGE_SIZE = 5000;
const MID_MIGRATION_ID = "probe_mig_mid";

const midCheckpoint: CustomerCheckpointExclusion = {
	migrationInternalId: MID_MIGRATION_ID,
	migrationRunId: "probe_run_parity",
	dryRun: false,
	excludedStatuses: [
		MigrationItemRunStatus.Succeeded,
		MigrationItemRunStatus.Skipped,
		MigrationItemRunStatus.Failed,
	],
};

const main = async () => {
	const { ctx } = await getBenchContext();
	const { db } = ctx;

	const shapes: {
		key: string;
		filter: CustomerFilter;
		checkpoint?: CustomerCheckpointExclusion;
		cursor?: string;
	}[] = [
		{ key: "selective", filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID } } },
		{ key: "dominant", filter: { plan: { plan_id: BENCH_FREE_PRODUCT_ID } } },
		{
			key: "multi-plan",
			filter: {
				plan: {
					plan_id: { $in: [BENCH_PAID_PRODUCT_ID, BENCH_FREE_BARE_PRODUCT_ID] },
				},
			},
		},
		{
			key: "custom-false",
			filter: { plan: { plan_id: BENCH_FREE_PRODUCT_ID, custom: false } },
		},
		{
			key: "custom-true",
			filter: { plan: { plan_id: BENCH_FREE_PRODUCT_ID, custom: true } },
		},
		{
			key: "residual-paid-false",
			filter: { plan: { plan_id: BENCH_FREE_PRODUCT_ID, paid: false } },
		},
		{
			key: "residual-paid-true",
			filter: { plan: { plan_id: BENCH_FREE_PRODUCT_ID, paid: true } },
		},
		{
			key: "derived-recurring-true",
			filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID, recurring: true } },
		},
		{
			key: "derived-base-price",
			filter: {
				plan: { plan_id: BENCH_PAID_PRODUCT_ID, price: { $ne: null } },
			},
		},
		{
			key: "derived-no-base-price",
			filter: { plan: { plan_id: BENCH_FREE_PRODUCT_ID, price: null } },
		},
		{
			key: "residual-item",
			filter: {
				plan: {
					plan_id: BENCH_FREE_BARE_PRODUCT_ID,
					item: { feature_id: TestFeature.Messages },
				},
			},
		},
		{ key: "customer-id", filter: { customer_id: "bench-c-1234" } },
		{
			key: "none-quantifier",
			filter: { plan: { $none: { plan_id: BENCH_PAID_PRODUCT_ID } } },
		},
		{
			key: "checkpoint-midrun",
			filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID } },
			checkpoint: midCheckpoint,
		},
		{
			key: "cursor-midrange",
			filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID } },
			cursor: "cus_bench_3500001",
		},
	];

	let failures = 0;
	for (const shape of shapes) {
		const baseArgs = {
			orgId: ctx.org.id,
			env: ctx.env,
			filter: shape.filter,
			ctx: { features: ctx.features },
			checkpoint: shape.checkpoint,
			afterInternalId: shape.cursor,
		};
		const legacy = buildCustomerSelect(baseArgs);
		const paged = buildCustomerSelect({ ...baseArgs, limit: FULL_SET_LIMIT });

		const started = Date.now();
		const [row] = (await db.execute(sql`
			WITH legacy AS (${legacy}), paged AS (${paged})
			SELECT
				(SELECT COUNT(*) FROM legacy)::bigint AS legacy_count,
				(SELECT COUNT(*) FROM paged)::bigint AS paged_count,
				(SELECT COUNT(*) FROM (
					SELECT internal_id FROM legacy EXCEPT ALL SELECT internal_id FROM paged
				) d)::bigint AS missing_from_paged,
				(SELECT COUNT(*) FROM (
					SELECT internal_id FROM paged EXCEPT ALL SELECT internal_id FROM legacy
				) d)::bigint AS extra_in_paged
		`)) as Record<string, string>[];

		const ok =
			row.legacy_count === row.paged_count &&
			Number(row.missing_from_paged) === 0 &&
			Number(row.extra_in_paged) === 0;
		if (!ok) failures++;
		console.log(
			`${ok ? "OK  " : "FAIL"} ${shape.key}: legacy=${Number(row.legacy_count).toLocaleString()} paged=${Number(row.paged_count).toLocaleString()} missing=${row.missing_from_paged} extra=${row.extra_in_paged} (${Date.now() - started}ms)`,
		);
	}

	// Page-iteration integrity: full pages until the set is exhausted, ids
	// strictly descending across page boundaries, total == full-set count.
	console.log("── page iteration (selective, 5k pages) ─────────");
	let cursor: string | undefined;
	let total = 0;
	let pages = 0;
	let previousLast: string | undefined;
	let integrityOk = true;
	while (true) {
		const rows = (await db.execute(
			buildCustomerSelect({
				orgId: ctx.org.id,
				env: ctx.env,
				filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID } },
				ctx: { features: ctx.features },
				limit: PAGE_SIZE,
				afterInternalId: cursor,
			}),
		)) as { internal_id: string }[];
		if (rows.length === 0) break;
		pages++;
		total += rows.length;
		if (previousLast !== undefined && rows[0].internal_id >= previousLast) {
			integrityOk = false;
			console.log(
				`FAIL page ${pages}: first id not below previous page's last`,
			);
		}
		if (rows.length < PAGE_SIZE) {
			console.log(`final page ${pages}: ${rows.length} rows`);
			cursor = rows[rows.length - 1].internal_id;
			previousLast = cursor;
			// A short page must mean exhaustion — verified by the loop's next
			// iteration returning zero rows.
			continue;
		}
		cursor = rows[rows.length - 1].internal_id;
		previousLast = cursor;
	}
	const expectedTotal = 600_000;
	const totalOk = total === expectedTotal;
	if (!totalOk || !integrityOk) failures++;
	console.log(
		`${totalOk && integrityOk ? "OK  " : "FAIL"} iterated ${pages} pages, ${total.toLocaleString()} customers (expected ${expectedTotal.toLocaleString()})`,
	);

	console.log(
		failures === 0 ? "\nALL PARITY CHECKS PASSED" : `\n${failures} FAILURES`,
	);
	process.exit(failures === 0 ? 0 : 1);
};

await main();
