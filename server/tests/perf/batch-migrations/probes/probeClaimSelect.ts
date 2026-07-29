/**
 * Read-only probe for the claim step's SELECT (buildCustomerSelect): prints
 * the compiled SQL, EXPLAIN (ANALYZE, BUFFERS), and wall-clock timings.
 *
 *   bun tests/perf/batch-migrations/probeClaimSelect.ts --plan bench-paid
 *   bun tests/perf/batch-migrations/probeClaimSelect.ts --plan bench-paid --after cus_bench_999999
 */

import { MigrationItemRunStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import { BENCH_PAID_PRODUCT_ID, getBenchContext } from "../utils/benchContext.js";

const PAGE_SIZE = 5000;

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	return {
		plan: get("--plan") ?? BENCH_PAID_PRODUCT_ID,
		after: get("--after"),
		limit: Number(get("--limit") ?? PAGE_SIZE),
	};
};

const main = async () => {
	const { plan, after, limit } = parseArgs();
	const { ctx } = await getBenchContext();
	const { db } = ctx;

	const buildSelect = () =>
		buildCustomerSelect({
			orgId: ctx.org.id,
			env: ctx.env,
			filter: { plan: { plan_id: plan } },
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
			limit,
			afterInternalId: after,
		});

	const compiled = new PgDialect().sqlToQuery(buildSelect());
	console.log("── compiled SQL ─────────────────────────────────────");
	console.log(compiled.sql);
	console.log("── params ───────────────────────────────────────────");
	console.log(compiled.params);

	console.log("── EXPLAIN (ANALYZE, BUFFERS) ───────────────────────");
	const planRows = (await db.execute(
		sql`EXPLAIN (ANALYZE, BUFFERS) ${buildSelect()}`,
	)) as Record<string, string>[];
	for (const row of planRows) console.log(Object.values(row)[0]);

	console.log("── timed runs ───────────────────────────────────────");
	for (let run = 1; run <= 3; run++) {
		const started = Date.now();
		const rows = (await db.execute(buildSelect())) as { internal_id: string }[];
		const ms = Date.now() - started;
		const first = rows[0]?.internal_id;
		const last = rows[rows.length - 1]?.internal_id;
		console.log(
			`run ${run}: ${rows.length.toLocaleString()} rows in ${ms}ms (${first} .. ${last})`,
		);
	}
	process.exit(0);
};

await main();
