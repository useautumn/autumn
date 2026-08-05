import { describe, expect, test } from "bun:test";
import { computePoolBudgetWarnings } from "@/db/initDrizzle.js";

const prodDefaults = {
	criticalPoolMax: 22,
	generalPoolMax: 14,
	replicaPoolMax: 9,
};

describe("computePoolBudgetWarnings", () => {
	test("prod defaults stay inside both bouncer budgets", () => {
		expect(computePoolBudgetWarnings(prodDefaults)).toEqual([]);
	});

	test("oversized primary pools trip only the primary guard", () => {
		// 90 x (60 + 60) + 362 = 11,162 > 0.85 x 12,000 = 10,200
		const warnings = computePoolBudgetWarnings({
			...prodDefaults,
			criticalPoolMax: 60,
			generalPoolMax: 60,
		});
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("primary PgBouncer");
	});

	test("oversized replica pool trips only the replica guard", () => {
		// 90 x 12 = 1,080 > 0.85 x 1,000 = 850
		const warnings = computePoolBudgetWarnings({
			...prodDefaults,
			replicaPoolMax: 12,
		});
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("replica PgBouncer");
	});

	test("replica budget boundary: 9 per process fits, 10 does not", () => {
		// 90 x 9 = 810 <= 850, but 90 x 10 = 900 > 850
		expect(
			computePoolBudgetWarnings({ ...prodDefaults, replicaPoolMax: 9 }),
		).toEqual([]);
		expect(
			computePoolBudgetWarnings({ ...prodDefaults, replicaPoolMax: 10 }),
		).toHaveLength(1);
	});

	test("both guards fire when both budgets are blown", () => {
		const warnings = computePoolBudgetWarnings({
			criticalPoolMax: 80,
			generalPoolMax: 80,
			replicaPoolMax: 20,
		});
		expect(warnings).toHaveLength(2);
	});
});
