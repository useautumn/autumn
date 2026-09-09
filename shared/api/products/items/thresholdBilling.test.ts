import { describe, expect, test } from "bun:test";
import { ApiPlanItemV1Schema } from "./apiPlanItemV1.js";
import { CreatePlanItemParamsV1Schema } from "./crud/createPlanItemParamsV1.js";

const item = {
	feature_id: "messages",
	included: 1000,
	unlimited: false,
	reset: { interval: "month" },
	price: {
		amount: 2,
		interval: "month",
		billing_units: 10,
		billing_method: "usage_based",
		max_purchase: null,
	},
	threshold_billing: { threshold: 100 },
};

describe("threshold billing item", () => {
	test("preserves feature-unit thresholds in requests and responses", () => {
		expect(CreatePlanItemParamsV1Schema.parse(item)).toMatchObject({
			threshold_billing: { threshold: 100 },
		});
		expect(ApiPlanItemV1Schema.parse(item)).toMatchObject({
			threshold_billing: { threshold: 100 },
		});
	});

	test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects invalid threshold %s",
		(threshold) => {
			expect(
				CreatePlanItemParamsV1Schema.safeParse({
					...item,
					threshold_billing: { threshold },
				}).success,
			).toBe(false);
		},
	);

	test.each([
		{ price: undefined },
		{ unlimited: true },
		{ price: { ...item.price, billing_method: "prepaid" } },
		{
			price: {
				...item.price,
				amount: undefined,
				tiers: [{ to: "inf", amount: 2 }],
			},
		},
	])("rejects incompatible item %j", (overrides) => {
		expect(
			CreatePlanItemParamsV1Schema.safeParse({ ...item, ...overrides }).success,
		).toBe(false);
	});

	test("preserves omission and explicit removal", () => {
		expect(
			CreatePlanItemParamsV1Schema.parse({
				...item,
				threshold_billing: undefined,
			}),
		).not.toHaveProperty("threshold_billing", { threshold: 100 });
		expect(
			CreatePlanItemParamsV1Schema.parse({ ...item, threshold_billing: null }),
		).toMatchObject({ threshold_billing: null });
	});
});
