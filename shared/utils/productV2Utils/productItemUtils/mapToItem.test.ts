import { describe, expect, test } from "bun:test";
import { BillWhen } from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { UsageModel } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { toProductItem } from "./mapToItem.js";

describe("toProductItem", () => {
	test("maps standalone fixed prices to a base price item", () => {
		const item = toProductItem({
			price: {
				id: "pr_base",
				created_at: 1,
				tier_behavior: null,
				config: {
					type: "fixed",
					amount: 300,
					interval: "month",
				},
			} as any,
		});

		expect(item).toMatchObject({
			feature_id: null,
			price: 300,
			price_id: "pr_base",
		});
	});

	test("keeps feature linkage for standalone usage prices", () => {
		const item = toProductItem({
			price: {
				id: "pr_topup",
				created_at: 1,
				tier_behavior: null,
				config: {
					type: "usage",
					bill_when: BillWhen.InAdvance,
					billing_units: 175000,
					internal_feature_id: "if_credits",
					feature_id: "CREDITS",
					usage_tiers: [{ to: 175000, amount: 177 }],
					interval: "one_off",
				},
			} as any,
		});

		expect(item).toMatchObject({
			feature_id: "CREDITS",
			included_usage: 0,
			billing_units: 175000,
			usage_model: UsageModel.Prepaid,
			price_id: "pr_topup",
		});
		expect(item.tiers).toEqual([{ to: 175000, amount: 177, flat_amount: undefined }]);
	});
});
