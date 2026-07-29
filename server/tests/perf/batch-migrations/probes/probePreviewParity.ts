/**
 * U4 verification: execution-view (mode "all") union — membership parity vs
 * legacy semantics (filter-set ∪ processed⋈customers), plus page/count
 * timings. Includes the disjoint case: processed ids OUTSIDE the filter set.
 *
 *   bun tests/perf/batch-migrations/probes/probePreviewParity.ts
 */

import type { CustomerFilter } from "@autumn/shared";
import { sql } from "drizzle-orm";
import {
	buildCustomerSelect,
	buildProcessedPreviewCount,
	buildProcessedPreviewSelect,
} from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import {
	BENCH_FREE_BARE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const MID_MIGRATION_ID = "probe_mig_mid";
const FULL_SET_LIMIT = 10_000_000;

const main = async () => {
	const { ctx } = await getBenchContext();
	const { db } = ctx;

	const shapes: { key: string; filter: CustomerFilter; expected: string }[] = [
		{
			key: "overlap (paid ∪ processed⊆paid)",
			filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID } },
			expected: "600,000",
		},
		{
			key: "disjoint (free-bare ∪ processed outside filter)",
			filter: { plan: { plan_id: BENCH_FREE_BARE_PRODUCT_ID } },
			expected: "1,300,000",
		},
	];

	let failures = 0;
	for (const shape of shapes) {
		const baseArgs = {
			orgId: ctx.org.id,
			env: ctx.env,
			filter: shape.filter,
			ctx: { features: ctx.features },
			includeProcessed: { migrationInternalId: MID_MIGRATION_ID },
		};

		// Ground truth: legacy filter select (no limit) ∪ processed⋈customers.
		const legacyFilterSelect = buildCustomerSelect({
			orgId: ctx.org.id,
			env: ctx.env,
			filter: shape.filter,
			ctx: { features: ctx.features },
		});
		const truthUnion = sql`
			SELECT l.internal_id FROM (${legacyFilterSelect}) l
			UNION
			SELECT c.internal_id FROM customers c
			WHERE c.org_id = ${ctx.org.id} AND c.env = ${ctx.env}
				AND c.internal_id IN (
					SELECT mir.item_id FROM migration_item_runs mir
					WHERE mir.migration_internal_id = ${MID_MIGRATION_ID}
						AND mir.item_kind = 'customer' AND mir.dry_run = false
				)
		`;
		const newFullSet = buildProcessedPreviewSelect({
			...baseArgs,
			limit: FULL_SET_LIMIT,
		});

		const [diff] = (await db.execute(sql`
			WITH truth AS (${truthUnion}), paged AS (SELECT internal_id FROM (${newFullSet}) p)
			SELECT
				(SELECT COUNT(*) FROM truth)::bigint AS truth_count,
				(SELECT COUNT(*) FROM paged)::bigint AS paged_count,
				(SELECT COUNT(*) FROM (
					SELECT internal_id FROM truth EXCEPT ALL SELECT internal_id FROM paged
				) d)::bigint AS missing,
				(SELECT COUNT(*) FROM (
					SELECT internal_id FROM paged EXCEPT ALL SELECT internal_id FROM truth
				) d)::bigint AS extra
		`)) as Record<string, string>[];

		const membershipOk =
			diff.truth_count === diff.paged_count &&
			Number(diff.missing) === 0 &&
			Number(diff.extra) === 0;

		const pageStarted = Date.now();
		const pageRows = (await db.execute(
			buildProcessedPreviewSelect({ ...baseArgs, limit: 51 }),
		)) as unknown[];
		const pageMs = Date.now() - pageStarted;

		const countStarted = Date.now();
		const [countRow] = (await db.execute(
			buildProcessedPreviewCount(baseArgs),
		)) as { count: string }[];
		const countMs = Date.now() - countStarted;

		const countOk =
			Number(countRow.count).toLocaleString() === shape.expected &&
			countRow.count === diff.truth_count;
		if (!membershipOk || !countOk) failures++;
		console.log(
			`${membershipOk && countOk ? "OK  " : "FAIL"} ${shape.key}: union=${Number(diff.truth_count).toLocaleString()} missing=${diff.missing} extra=${diff.extra} | page(51)=${pageRows.length} rows in ${pageMs}ms | count in ${countMs}ms`,
		);
	}

	console.log(failures === 0 ? "\nALL PREVIEW CHECKS PASSED" : `\n${failures} FAILURES`);
	process.exit(failures === 0 ? 0 : 1);
};

await main();
