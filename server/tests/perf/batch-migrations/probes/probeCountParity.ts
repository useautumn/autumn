/**
 * U3 count verification: buildCustomerCount (compiler-chosen access path)
 * vs ground truth (COUNT over the legacy no-limit select) — value parity
 * plus timings, per filter shape.
 *
 *   bun tests/perf/batch-migrations/probes/probeCountParity.ts
 */

import type { CustomerFilter } from "@autumn/shared";
import { MigrationItemRunStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { CustomerCheckpointExclusion } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import {
	buildCustomerCount,
	buildCustomerSelect,
} from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import {
	BENCH_FREE_BARE_PRODUCT_ID,
	BENCH_FREE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const midCheckpoint: CustomerCheckpointExclusion = {
	migrationInternalId: "probe_mig_mid",
	migrationRunId: "probe_run_count",
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
			key: "derived-paid-true",
			filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID, paid: true } },
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
			key: "checkpoint-midrun",
			filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID } },
			checkpoint: midCheckpoint,
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
		};

		const started = Date.now();
		const [countRow] = (await db.execute(buildCustomerCount(baseArgs))) as {
			count: string;
		}[];
		const countMs = Date.now() - started;

		const truthStarted = Date.now();
		const [truthRow] = (await db.execute(
			sql`SELECT COUNT(*)::bigint AS count FROM (${buildCustomerSelect(baseArgs)}) legacy`,
		)) as { count: string }[];
		const truthMs = Date.now() - truthStarted;

		const ok = countRow.count === truthRow.count;
		if (!ok) failures++;
		console.log(
			`${ok ? "OK  " : "FAIL"} ${shape.key}: count=${Number(countRow.count).toLocaleString()} in ${countMs}ms (truth=${Number(truthRow.count).toLocaleString()} in ${truthMs}ms)`,
		);
	}

	console.log(
		failures === 0 ? "\nALL COUNT CHECKS PASSED" : `\n${failures} FAILURES`,
	);
	process.exit(failures === 0 ? 0 : 1);
};

await main();
