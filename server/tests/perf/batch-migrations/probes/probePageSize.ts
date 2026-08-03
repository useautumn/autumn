/** Times the claim select at increasing page sizes (5k → 50k). Read-only. */

import { MigrationItemRunStatus } from "@autumn/shared";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import {
	BENCH_FREE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const main = async () => {
	const { ctx } = await getBenchContext();
	const { db } = ctx;

	const freshCheckpoint = {
		migrationInternalId: "probe_mig_none",
		migrationRunId: "probe_run_none",
		dryRun: false,
		excludedStatuses: [
			MigrationItemRunStatus.Succeeded,
			MigrationItemRunStatus.Skipped,
			MigrationItemRunStatus.Failed,
		],
	};

	for (const planId of [BENCH_PAID_PRODUCT_ID, BENCH_FREE_PRODUCT_ID]) {
		for (const limit of [5000, 25_000, 50_000]) {
			for (let run = 1; run <= 2; run++) {
				const started = Date.now();
				const rows = (await db.execute(
					buildCustomerSelect({
						orgId: ctx.org.id,
						env: ctx.env,
						filter: { plan: { plan_id: planId } },
						ctx: { features: ctx.features },
						checkpoint: freshCheckpoint,
						limit,
					}),
				)) as { internal_id: string }[];
				const ms = Date.now() - started;
				console.log(
					`${planId} limit=${limit.toLocaleString()} run ${run}: ${rows.length.toLocaleString()} rows in ${ms}ms (${(ms / rows.length).toFixed(3)}ms/row)`,
				);
			}
		}
	}
	process.exit(0);
};

await main();
