import { describe, expect, test } from "bun:test";
import { attachFormOverridesFromRequestBody } from "./attachFormOverridesFromRequestBody";

describe("attachFormOverridesFromRequestBody", () => {
	test("maps a resolved V0 request into form overrides", () => {
		const overrides = attachFormOverridesFromRequestBody({
			billing_behavior: "none",
			currency: "eur",
			customer_id: "cus_1",
			enable_product_immediately: true,
			ends_at: 1760000000000,
			free_trial: { card_required: false, duration: "day", length: 7 },
			items: [{ feature_id: null, price: 1000, interval: "month" }],
			options: [{ feature_id: "seats", quantity: 5 }],
			plan_schedule: "end_of_cycle",
			product_id: "scale",
			remove_plan_ids: ["launch"],
			upsert_licenses: [{ license_plan_id: "lp_1", quantity: 2 }],
			version: 3,
		});
		expect(overrides).toMatchObject({
			currency: "eur",
			enablePlanImmediately: true,
			endDate: 1760000000000,
			isCustom: true,
			items: [{ feature_id: null, price: 1000, interval: "month" }],
			planSchedule: "end_of_cycle",
			prepaidOptions: { seats: 5 },
			productId: "scale",
			prorationBehavior: "none",
			removePlanIds: ["launch"],
			trialCardRequired: false,
			trialDuration: "day",
			trialEnabled: true,
			trialLength: 7,
			version: 3,
		});
	});

	test("null free_trial disables the trial", () => {
		const overrides = attachFormOverridesFromRequestBody({
			free_trial: null,
			product_id: "scale",
		});
		expect(overrides.trialEnabled).toBe(false);
	});

	test("maps billing cycle anchor and carry-overs", () => {
		const overrides = attachFormOverridesFromRequestBody({
			billing_cycle_anchor: 1755000000000,
			carry_over_balances: { enabled: true, feature_ids: ["credits"] },
			carry_over_usages: { enabled: true },
			product_id: "scale",
		});
		expect(overrides).toMatchObject({
			billingCycleAnchorDate: 1755000000000,
			billingCycleAnchorMode: "custom",
			carryOverBalanceFeatureIds: ["credits"],
			carryOverBalances: true,
			carryOverUsages: true,
			resetBillingCycle: true,
		});
	});

	test("maps a resolved multi-attach request into primary + additional plans", () => {
		const overrides = attachFormOverridesFromRequestBody({
			billing_behavior: "none",
			customer_id: "cus_1",
			currency: "usd",
			enable_plan_immediately: true,
			free_trial: { card_required: true, duration: "day", length: 14 },
			plans: [
				{
					feature_quantities: [{ feature_id: "seats", quantity: 5 }],
					items: [{ feature_id: null, interval: "month", price: 500 }],
					plan_id: "scale",
					version: 2,
				},
				{
					entity_id: "ent_1",
					plan_id: "enterprise",
				},
			],
		});
		expect(overrides).toMatchObject({
			additionalPlans: [
				{
					_id: "seeded-plan-0",
					entityId: "ent_1",
					isCustom: false,
					items: null,
					productId: "enterprise",
				},
			],
			currency: "usd",
			enablePlanImmediately: true,
			isCustom: true,
			items: [{ feature_id: null, interval: "month", price: 500 }],
			prepaidOptions: { seats: 5 },
			productId: "scale",
			prorationBehavior: "none",
			trialDuration: "day",
			trialEnabled: true,
			trialLength: 14,
			version: 2,
		});
	});

	test("single-plan plans array still seeds primary only", () => {
		const overrides = attachFormOverridesFromRequestBody({
			customer_id: "cus_1",
			plans: [{ plan_id: "scale" }],
		});
		expect(overrides).toMatchObject({
			additionalPlans: [],
			productId: "scale",
		});
	});
});
