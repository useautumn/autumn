/** Red: pull drops a priced item's reset; green: pull and push preserve both intervals. */
import { describe, expect, test } from "bun:test";
import type { Plan } from "../../src/compose/models/index.js";
import { transformApiPlan } from "../../src/lib/transforms/apiToSdk/plan.js";
import { transformPlanToApi } from "../../src/lib/transforms/sdkToApi/plan.js";
import { buildPlanCode } from "../../src/lib/transforms/sdkToCode/plan.js";

const apiPlan = {
	id: "scale-annual",
	name: "Scale Annual",
	version: 1,
	items: [
		{
			feature_id: "credits",
			included: 1_000,
			unlimited: false,
			reset: { interval: "month" as const },
			price: {
				amount: 100,
				billing_method: "prepaid" as const,
				billing_units: 1_000,
				interval: "year" as const,
			},
		},
	],
};

describe("separate reset and billing intervals", () => {
	test("pull generates config with both intervals", () => {
		const pulled = transformApiPlan(apiPlan as never);
		const code = buildPlanCode(pulled, []);

		expect(code).toContain("reset: {");
		expect(code).toContain("interval: 'month'");
		expect(code).toContain("interval: 'year'");
	});

	test("pull and push preserve both intervals", () => {
		const pulled = transformApiPlan(apiPlan as never);
		const pushed = transformPlanToApi(pulled as Plan);

		expect(pushed.items?.[0]).toMatchObject({
			reset: { interval: "month" },
			price: { interval: "year", billing_method: "prepaid" },
		});
	});
});
