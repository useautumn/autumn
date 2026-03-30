import { describe, expect, test } from "bun:test";
import { BillWhen } from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import type { Price } from "../../../models/productModels/priceModels/priceModels.js";
import { UsageModel } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { toProductItem } from "./mapToItem.js";

describe("toProductItem", () => {
	test("maps standalone fixed prices to a base price item", () => {
		const price: Price = {
			id: "pr_base",
			internal_product_id: "prod_base",
			created_at: 1,
			tier_behavior: null,
			entitlement_id: null,
			proration_config: null,
			config: {
				type: "fixed",
				amount: 300,
				interval: "month",
			},
		};

		const item = toProductItem({
			price,
		});

		expect(item).toMatchObject({
			feature_id: null,
			price: 300,
			price_id: "pr_base",
		});
	});

	test("keeps feature linkage for standalone usage prices", () => {
		const price: Price = {
			id: "pr_topup",
			internal_product_id: "prod_topup",
			created_at: 1,
			tier_behavior: null,
			entitlement_id: null,
			proration_config: null,
			config: {
				type: "usage",
				bill_when: BillWhen.InAdvance,
				billing_units: 175000,
				internal_feature_id: "if_credits",
				feature_id: "CREDITS",
				usage_tiers: [{ to: 175000, amount: 177 }],
				interval: "one_off",
			},
		};

		const item = toProductItem({
			price,
		});

		expect(item).toMatchObject({
			feature_id: "CREDITS",
			included_usage: 0,
			billing_units: 175000,
			usage_model: UsageModel.Prepaid,
			price_id: "pr_topup",
		});
		expect(item.tiers).toEqual([
			{ to: 175000, amount: 177, flat_amount: undefined },
		]);
	});
});
