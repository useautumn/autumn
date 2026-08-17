import { describe, expect, test } from "bun:test";
import type { ProductV2 } from "../../../models/productV2Models/productV2Models.js";
import { productsAreSame } from "./compareProductUtils.js";

const topUpPlan = (withSgd = false) =>
	({
		id: "topup_credits",
		name: "Top-up credits",
		items: [
			{
				feature_id: "ai_credits",
				included_usage: 0,
				interval: null,
				usage_model: "prepaid",
				billing_units: 100,
				tiers: [
					{
						to: "inf",
						amount: 1,
						...(withSgd
							? {
									additional_currencies: [{ currency: "sgd", amount: 1.4 }],
								}
							: {}),
					},
				],
				...(withSgd ? { base_currency: "usd" } : {}),
			},
		],
	}) as ProductV2;

describe("productsAreSame currency edits", () => {
	test("detects adding a currency to a one-off single-tier feature price", () => {
		const comparison = productsAreSame({
			curProductV2: topUpPlan(),
			newProductV2: topUpPlan(true),
			features: [],
		});

		expect(comparison.itemsSame).toBe(false);
	});
});
