/** Repro: dashboard count for plan+custom:false+recurring:true+price exists.
 *   bun tests/perf/batch-migrations/probes/probeScopedFilterCount.ts */
import type { CustomerFilter } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { buildCustomerCount } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import { BENCH_PAID_PRODUCT_ID, getBenchContext } from "../utils/benchContext.js";

const { ctx } = await getBenchContext();
const filter: CustomerFilter = {
	plan: {
		plan_id: BENCH_PAID_PRODUCT_ID,
		custom: false,
		recurring: true,
		price: { $ne: null },
	},
};
const count = buildCustomerCount({
	orgId: ctx.org.id, env: ctx.env, filter, ctx: { features: ctx.features },
});
for (const label of ["run1 (cold)", "run2 (warm)"]) {
	const started = Date.now();
	const [row] = (await ctx.db.execute(count)) as { count: string }[];
	console.log(`${label}: count=${row.count} in ${Date.now() - started}ms`);
}
const plan = (await ctx.db.execute(sql`EXPLAIN (ANALYZE, BUFFERS) ${count}`)) as Record<string, unknown>[];
for (const row of plan) {
	const line = Object.values(row)[0] as string;
	if (/Seq Scan|Execution|rows=\d{6,}|SubPlan|Aggregate|loops=[1-9]\d{3,}/.test(line)) console.log(line.trim().slice(0, 160));
}
process.exit(0);
