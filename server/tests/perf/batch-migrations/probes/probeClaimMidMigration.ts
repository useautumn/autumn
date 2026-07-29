/**
 * Replicates the mid-migration claim state: half of bench-paid's 600k
 * customers already have `succeeded` item runs, then times the claim SELECT
 * both without a cursor (restart/crash-recovery path — anti-join must reject
 * all processed rows) and with the resume cursor (normal mid-run page).
 *
 *   bun tests/perf/batch-migrations/probeClaimMidMigration.ts
 *   bun tests/perf/batch-migrations/probeClaimMidMigration.ts --cleanup
 */

import { MigrationItemRunStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import {
	BENCH_INTERNAL_CUSTOMER_PREFIX,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const PROBE_MIGRATION_ID = "probe_mig_mid";
const PAGE_SIZE = 5000;
// bench-paid seed range is 3,200,001..3,800,000; the top half in claim order
// (internal_id DESC) is 3,500,001..3,800,000.
const PROCESSED_START = 3_500_001;
const PROCESSED_END = 3_800_000;
const RESUME_CURSOR = `${BENCH_INTERNAL_CUSTOMER_PREFIX}${PROCESSED_START}`;

const main = async () => {
	const cleanup = process.argv.includes("--cleanup");
	const { ctx } = await getBenchContext();
	const { db } = ctx;

	if (cleanup) {
		await db.execute(
			sql`DELETE FROM migration_item_runs WHERE migration_internal_id = ${PROBE_MIGRATION_ID}`,
		);
		console.log("probe: cleaned up seeded item runs");
		process.exit(0);
	}

	const seedStarted = Date.now();
	await db.execute(sql`
		INSERT INTO migration_item_runs (
			migration_item_run_id, migration_internal_id, migration_run_id,
			dry_run, item_kind, item_id, status, created_at, updated_at
		)
		SELECT
			'mir_probe_' || i,
			${PROBE_MIGRATION_ID},
			'probe_run_prior',
			false,
			'customer',
			${BENCH_INTERNAL_CUSTOMER_PREFIX} || i,
			${MigrationItemRunStatus.Succeeded},
			${Date.now()}::bigint,
			NULL
		FROM GENERATE_SERIES(${PROCESSED_START}::int, ${PROCESSED_END}::int) AS g(i)
		ON CONFLICT DO NOTHING
	`);
	const [{ count }] = (await db.execute(sql`
		SELECT COUNT(*)::bigint AS count FROM migration_item_runs
		WHERE migration_internal_id = ${PROBE_MIGRATION_ID}
	`)) as { count: string }[];
	console.log(
		`probe: seeded state — ${Number(count).toLocaleString()} succeeded item runs in ${Date.now() - seedStarted}ms`,
	);

	const buildSelect = (afterInternalId?: string) =>
		buildCustomerSelect({
			orgId: ctx.org.id,
			env: ctx.env,
			filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID } },
			ctx: { features: ctx.features },
			checkpoint: {
				migrationInternalId: PROBE_MIGRATION_ID,
				migrationRunId: "probe_run_resume",
				dryRun: false,
				excludedStatuses: [
					MigrationItemRunStatus.Succeeded,
					MigrationItemRunStatus.Skipped,
					MigrationItemRunStatus.Failed,
				],
			},
			limit: PAGE_SIZE,
			afterInternalId,
		});

	const scenarios: { label: string; after?: string }[] = [
		{ label: "mid-run, NO cursor (restart path)", after: undefined },
		{ label: `mid-run, cursor=${RESUME_CURSOR}`, after: RESUME_CURSOR },
	];

	for (const scenario of scenarios) {
		console.log(`── ${scenario.label} ───────────────────────────────`);
		const planRows = (await db.execute(
			sql`EXPLAIN (ANALYZE, BUFFERS) ${buildSelect(scenario.after)}`,
		)) as Record<string, string>[];
		for (const row of planRows) console.log(Object.values(row)[0]);

		for (let run = 1; run <= 2; run++) {
			const started = Date.now();
			const rows = (await db.execute(buildSelect(scenario.after))) as {
				internal_id: string;
			}[];
			const ms = Date.now() - started;
			console.log(
				`timed run ${run}: ${rows.length.toLocaleString()} rows in ${ms}ms (${rows[0]?.internal_id} .. ${rows[rows.length - 1]?.internal_id})`,
			);
		}
	}
	process.exit(0);
};

await main();
