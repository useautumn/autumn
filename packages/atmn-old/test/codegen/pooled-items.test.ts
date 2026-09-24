/** Pooled items: pull emits pooled/entityFeatureId and push sends them back. */
import { describe, expect, test } from "bun:test";
import type { Plan } from "../../src/compose/models/index.js";
import { transformApiPlan } from "../../src/lib/transforms/apiToSdk/plan.js";
import { transformPlanToApi } from "../../src/lib/transforms/sdkToApi/plan.js";
import { buildPlanCode } from "../../src/lib/transforms/sdkToCode/plan.js";

const apiPlan = {
	id: "team",
	name: "Team",
	version: 1,
	items: [
		{
			feature_id: "credits",
			entity_feature_id: "seats",
			included: 500,
			unlimited: false,
			pooled: true,
			reset: { interval: "month" as const },
		},
		{
			feature_id: "messages",
			included: 100,
			unlimited: false,
			pooled: false,
			reset: { interval: "month" as const },
		},
	],
};

describe("pooled plan items", () => {
	test("pull generates config with pooled and entityFeatureId", () => {
		const pulled = transformApiPlan(apiPlan as never);
		const code = buildPlanCode(pulled, []);

		expect(code).toContain("pooled: true");
		expect(code).toContain("entityFeatureId: 'seats'");
	});

	test("pull omits pooled when false", () => {
		const pulled = transformApiPlan(apiPlan as never);

		expect(pulled.items?.[0]?.pooled).toBe(true);
		expect(pulled.items?.[1]?.pooled).toBeUndefined();
	});

	test("pull and push preserve pooled and entityFeatureId", () => {
		const pulled = transformApiPlan(apiPlan as never);
		const pushed = transformPlanToApi(pulled as Plan);

		expect(pushed.items?.[0]).toMatchObject({
			feature_id: "credits",
			entity_feature_id: "seats",
			pooled: true,
		});
		expect(pushed.items?.[1]).not.toHaveProperty("pooled");
	});
});
