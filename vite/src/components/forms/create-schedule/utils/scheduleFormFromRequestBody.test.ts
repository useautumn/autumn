import { describe, expect, test } from "bun:test";
import { scheduleFormFromRequestBody } from "./scheduleFormFromRequestBody";

describe("scheduleFormFromRequestBody", () => {
	test("maps phases, plans, and top-level flags", () => {
		const form = scheduleFormFromRequestBody({
			billing_behavior: "none",
			billing_cycle_anchor: "now",
			customer_id: "cus_1",
			enable_plan_immediately: true,
			phases: [
				{
					plans: [
						{
							feature_quantities: [{ feature_id: "seats", quantity: 5 }],
							items: [{ feature_id: null, interval: "month", price: 1000 }],
							plan_id: "scale",
						},
					],
					starts_at: "now",
				},
				{
					plans: [{ plan_id: "enterprise", version: 2 }],
					starts_at: 1790000000000,
				},
			],
			unscheduled_plans: [{ plan_id: "support-addon" }],
		});
		expect(form).toMatchObject({
			billingBehavior: "none",
			enablePlanImmediately: true,
			resetBillingCycle: true,
			unscheduledPlans: [
				{ isCustom: false, items: null, productId: "support-addon" },
			],
		});
		expect(form?.phases).toHaveLength(2);
		expect(form?.phases?.[0]).toMatchObject({
			plans: [
				{
					isCustom: true,
					items: [{ feature_id: null, interval: "month", price: 1000 }],
					prepaidOptions: { seats: 5 },
					productId: "scale",
				},
			],
			startsAt: null,
		});
		expect(form?.phases?.[1]).toMatchObject({
			plans: [{ productId: "enterprise", version: 2 }],
			startsAt: 1790000000000,
		});
	});

	test("folds starting_after offsets from the prior phase", () => {
		const form = scheduleFormFromRequestBody({
			phases: [
				{ plans: [{ plan_id: "launch" }], starts_at: 1780000000000 },
				{
					plans: [{ plan_id: "scale" }],
					starting_after: { duration_count: 2, duration_type: "month" },
				},
			],
		});
		const second = form?.phases?.[1]?.startsAt;
		expect(typeof second).toBe("number");
		expect(second).toBeGreaterThan(1780000000000);
	});

	test("returns undefined without phases", () => {
		expect(
			scheduleFormFromRequestBody({ customer_id: "cus_1" }),
		).toBeUndefined();
	});
});
