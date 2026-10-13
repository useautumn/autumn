import { describe, expect, test } from "bun:test";
import {
	Infinite,
	type ProductItem,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { itemInCurrency } from "@/views/products/plan/utils/currencyUtils";
import {
	billedTierLabel,
	itemToVolumeExampleBill,
} from "@/views/products/plan/utils/volumeExampleBill";

const item = {
	feature_id: "messages",
	included_usage: 100,
	billing_units: 1,
	usage_model: UsageModel.PayPerUse,
	tier_behavior: TierBehavior.VolumeBased,
	tiers: [
		{
			to: 400,
			amount: 0.1,
			flat_amount: 5,
			additional_currencies: [
				{ currency: "eur", amount: 0.09, flat_amount: 4.5 },
			],
		},
		{ to: 1900, amount: 0.08 },
		{ to: Infinite, amount: 0.05, flat_amount: 20 },
	],
} as ProductItem;

const eurItem = (tiers: ProductItem["tiers"]) =>
	itemInCurrency({
		item: { ...item, tiers },
		code: "eur",
		baseCurrency: "USD",
	});

describe("itemToVolumeExampleBill", () => {
	test.each([
		{
			name: "usage-based bills the 200 past included at the up-to-500 tier",
			bill: () => itemToVolumeExampleBill({ item, usage: 300 }),
			expected: { total: 25, billedUsage: 200, unitRate: 0.1 },
			label: "Up to 500",
		},
		{
			name: "prepaid bills every unit, included ones too",
			bill: () =>
				itemToVolumeExampleBill({
					item: { ...item, usage_model: UsageModel.Prepaid },
					usage: 300,
				}),
			expected: { total: 35, billedUsage: 300, unitRate: 0.1 },
			label: "Up to 500",
		},
		{
			name: "usage within the included amount bills nothing, flat fee included",
			bill: () => itemToVolumeExampleBill({ item, usage: 100 }),
			expected: { total: 0 },
			label: "Included",
		},
		{
			name: "usage past the last bound lands in the unlimited tier",
			bill: () => itemToVolumeExampleBill({ item, usage: 2500 }),
			expected: { total: 140, billedUsage: 2400 },
			label: "Unlimited",
		},
		{
			name: "the EUR tab bills with the EUR prices",
			bill: () =>
				itemToVolumeExampleBill({ item: eurItem(item.tiers), usage: 300 }),
			expected: { total: 22.5 },
			label: "Up to 500",
		},
		{
			name: "a blank EUR flat fee bills nothing, not the USD fee",
			bill: () =>
				itemToVolumeExampleBill({
					item: eurItem(
						item.tiers?.map((tier) => ({
							...tier,
							additional_currencies: [{ currency: "eur", amount: 0.09 }],
						})),
					),
					usage: 300,
				}),
			expected: { total: 18 },
			label: "Up to 500",
		},
	])("$name", ({ bill, expected, label }) => {
		const result = bill();
		expect(result).toMatchObject(expected);
		expect(billedTierLabel(result)).toBe(label);
	});
});
