import { describe, expect, test } from "bun:test";
import type { FullCusProduct } from "@autumn/shared";
import { changeAddsPayPerUsePrice } from "@/internal/approvals/facts/billing/changeAddsPayPerUsePrice";

const meteredAt = (amount: number, included = 100) =>
	({
		customer_entitlements: [
			{
				entitlement: {
					id: "ent_1",
					internal_product_id: "prod_1",
					allowance: included,
					interval: "month",
				},
			},
		],
		customer_prices: [
			{
				price: {
					entitlement_id: "ent_1",
					internal_product_id: "prod_1",
					config: {
						type: "usage",
						bill_when: "end_of_period",
						feature_id: "api_calls",
						internal_feature_id: "fe_1",
						interval: "month",
						usage_tiers: [{ to: -1, amount }],
						billing_units: 1,
					},
				},
			},
		],
	}) as unknown as FullCusProduct;

describe("changeAddsPayPerUsePrice", () => {
	test("a metered feature repriced upward is a new charge", () => {
		expect(
			changeAddsPayPerUsePrice({
				incoming: [meteredAt(0.02)],
				outgoing: [meteredAt(0.01)],
			}),
		).toBe(true);
	});

	test("the same usage terms are no new charge", () => {
		expect(
			changeAddsPayPerUsePrice({
				incoming: [meteredAt(0.01)],
				outgoing: [meteredAt(0.01)],
			}),
		).toBe(false);
	});

	test("less included usage at the same price is a new charge", () => {
		expect(
			changeAddsPayPerUsePrice({
				incoming: [meteredAt(0.01, 0)],
				outgoing: [meteredAt(0.01, 100)],
			}),
		).toBe(true);
	});

	test("a newly metered feature is a new charge", () => {
		expect(
			changeAddsPayPerUsePrice({ incoming: [meteredAt(0.01)], outgoing: [] }),
		).toBe(true);
	});
});
