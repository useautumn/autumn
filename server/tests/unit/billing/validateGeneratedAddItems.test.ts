import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	ResetInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { assertNoDuplicateAddItems } from "@/internal/billing/v2/actions/generateRequest/compute/validateGeneratedAddItems";
import type { GenerationContext } from "@/internal/billing/v2/actions/generateRequest/setup/setupGenerationContext";

const context = {
	customer: {
		id: "cus_1",
		current_plans: [
			{ customer_product_id: "cp_pro_1", plan_id: "pro", status: "active" },
		],
	},
	features: [],
	now: { epoch_ms: 0, iso: "1970-01-01T00:00:00.000Z" },
	plans: [
		{
			id: "pro",
			name: "Pro",
			price: { amount: 540, interval: BillingInterval.Month },
			items: [
				{
					feature_id: "AI_CREDITS",
					included: 10_000,
					pooled: true,
					reset: { interval: ResetInterval.Month },
					rollover: {
						expiry_duration_type: RolloverExpiryDurationType.Month,
						max_percentage: 50,
					},
				},
				{
					feature_id: "AI_CREDITS",
					included: 0,
					price: {
						amount: 0.01,
						billing_method: BillingMethod.UsageBased,
						billing_units: 1,
						interval: BillingInterval.Month,
					},
					reset: { interval: ResetInterval.Month },
				},
			],
		},
	],
} as unknown as GenerationContext;

describe("assertNoDuplicateAddItems", () => {
	test("a bare add for an existing allowance is rejected with pairing guidance", () => {
		expect(() =>
			assertNoDuplicateAddItems({
				context,
				customerProductId: "cp_pro_1",
				generated: {
					customize: {
						add_items: [
							{
								feature_id: "AI_CREDITS",
								included: 12_000,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				},
				tool: "update_subscription",
			}),
		).toThrow(/pair a remove_items filter/);
	});

	test("the same add paired with a remove filter passes", () => {
		expect(() =>
			assertNoDuplicateAddItems({
				context,
				customerProductId: "cp_pro_1",
				generated: {
					customize: {
						add_items: [
							{
								feature_id: "AI_CREDITS",
								included: 12_000,
								pooled: true,
								reset: { interval: ResetInterval.Month },
								rollover: {
									expiry_duration_type: RolloverExpiryDurationType.Month,
									max_percentage: 50,
								},
							},
						],
						remove_items: [{ feature_id: "AI_CREDITS", included: 10_000 }],
					},
				},
				tool: "update_subscription",
			}),
		).not.toThrow();
	});

	test("adding a genuinely new feature passes", () => {
		expect(() =>
			assertNoDuplicateAddItems({
				context,
				generated: {
					customize: { add_items: [{ feature_id: "SEATS", included: 5 }] },
					plan_id: "pro",
				},
				tool: "attach",
			}),
		).not.toThrow();
	});

	test("a usage-priced add does not collide with the free allowance item", () => {
		const slim = {
			...context,
			plans: [
				{
					id: "pro",
					name: "Pro",
					items: [
						{
							feature_id: "SEATS",
							included: 5,
							reset: { interval: ResetInterval.Month },
						},
					],
				},
			],
		} as unknown as GenerationContext;
		expect(() =>
			assertNoDuplicateAddItems({
				context: slim,
				generated: {
					customize: {
						add_items: [
							{
								feature_id: "SEATS",
								price: {
									amount: 10,
									billing_method: BillingMethod.UsageBased,
									interval: BillingInterval.Month,
								},
							},
						],
					},
					plan_id: "pro",
				},
				tool: "attach",
			}),
		).not.toThrow();
	});

	test("an unknown target plan is conservative and passes", () => {
		expect(() =>
			assertNoDuplicateAddItems({
				context,
				generated: {
					customize: {
						add_items: [{ feature_id: "AI_CREDITS", included: 12_000 }],
					},
				},
				tool: "attach",
			}),
		).not.toThrow();
	});
});
