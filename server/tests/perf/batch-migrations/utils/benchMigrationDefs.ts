import { TestFeature } from "@tests/setup/v2Features.js";
import {
	BENCH_FREE_BARE_PRODUCT_ID,
	BENCH_FREE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
} from "./benchContext.js";

/** add_items payloads by kind: consumable metered / boolean / non-consumable
 * metered (continuous use — no reset interval). */
export const BENCH_ITEMS: Record<string, Record<string, unknown>> = {
	words: {
		feature_id: TestFeature.Words,
		included: 100,
		reset: { interval: "month" },
	},
	dashboard: {
		feature_id: TestFeature.Dashboard,
	},
	workflows: {
		feature_id: TestFeature.Workflows,
		included: 10,
	},
};

export type BenchMigrationDef = {
	id: string;
	planId: string;
	items: Record<string, unknown>[];
};

/** Dashboard-runnable bench migrations; ids match benchRunMigration's
 * `bench-mig-<plan>-<item>` convention so both paths share rows. */
export const BENCH_MIGRATIONS: BenchMigrationDef[] = [
	{
		id: "bench-mig-bench-paid-words",
		planId: BENCH_PAID_PRODUCT_ID,
		items: [BENCH_ITEMS.words],
	},
	{
		id: "bench-mig-bench-free-words",
		planId: BENCH_FREE_PRODUCT_ID,
		items: [BENCH_ITEMS.words],
	},
	{
		id: "bench-mig-bench-free-bare-words",
		planId: BENCH_FREE_BARE_PRODUCT_ID,
		items: [BENCH_ITEMS.words],
	},
	{
		id: "bench-mig-bench-free-3-items",
		planId: BENCH_FREE_PRODUCT_ID,
		items: [BENCH_ITEMS.words, BENCH_ITEMS.dashboard, BENCH_ITEMS.workflows],
	},
	{
		id: "bench-mig-bench-paid-3-items",
		planId: BENCH_PAID_PRODUCT_ID,
		items: [BENCH_ITEMS.words, BENCH_ITEMS.dashboard, BENCH_ITEMS.workflows],
	},
];
