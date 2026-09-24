import { describe, expect, test } from "bun:test";
import type { Plan } from "../../compose/models/index.js";
import { transformApiPlan } from "./apiToSdk/plan.js";
import { transformPlanToApi } from "./sdkToApi/plan.js";
import { buildPlanCode } from "./sdkToCode/plan.js";

const sdkPlan: Plan = {
	id: "pro",
	name: "Pro",
	price: {
		amount: 20,
		interval: "month",
		additionalCurrencies: [{ currency: "eur", amount: 18 }],
	},
	items: [
		{
			featureId: "messages",
			included: 0,
			price: {
				amount: 0.1,
				interval: "month",
				billingMethod: "usage_based",
				additionalCurrencies: [{ currency: "eur", amount: 0.09 }],
			},
		},
		{
			featureId: "words",
			included: 0,
			price: {
				tiers: [
					{
						to: 100,
						amount: 0.5,
						additionalCurrencies: [
							{ currency: "eur", amount: 0.4, flatAmount: 5 },
						],
					},
					{
						to: "inf",
						amount: 0.3,
						additionalCurrencies: [{ currency: "eur", amount: 0.25 }],
					},
				],
				tierBehavior: "graduated",
				interval: "month",
				billingMethod: "usage_based",
			},
		},
	],
};

describe("multi-currency: sdk -> api", () => {
	test("maps additionalCurrencies at base, item, and tier level", () => {
		const api = transformPlanToApi(sdkPlan);

		expect(api.price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 18 },
		]);
		expect(api.items?.[0].price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.09 },
		]);
		expect(api.items?.[1].price?.tiers?.[0].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.4, flat_amount: 5 },
		]);
		expect(api.items?.[1].price?.tiers?.[1].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.25 },
		]);
	});

	test("omits additional_currencies when not set", () => {
		const api = transformPlanToApi({
			id: "basic",
			name: "Basic",
			price: { amount: 10, interval: "month" },
		});
		expect(api.price).toEqual({ amount: 10, interval: "month" });
	});
});

describe("multi-currency: api -> sdk (pull must not drop currencies)", () => {
	test("round-trips through pull and push unchanged", () => {
		const api = transformPlanToApi(sdkPlan);
		const pulled = transformApiPlan(api as never);
		const pushed = transformPlanToApi(pulled as Plan);

		expect(pushed.price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 18 },
		]);
		expect(pushed.items?.[0].price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.09 },
		]);
		expect(pushed.items?.[1].price?.tiers?.[0].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.4, flat_amount: 5 },
		]);
	});
});

describe("multi-currency: sdk -> code", () => {
	test("printed config carries additionalCurrencies at every level", () => {
		const code = buildPlanCode(sdkPlan, []);

		expect(code).toContain("additionalCurrencies");
		expect(code).toContain("currency: 'eur'");
		expect(code).toContain("amount: 18");
		expect(code).toContain("amount: 0.09");
		expect(code).toContain("amount: 0.4");
	});
});
