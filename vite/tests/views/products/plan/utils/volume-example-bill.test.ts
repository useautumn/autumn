import { describe, expect, test } from "bun:test";
import { Infinite, type ProductItem, TierBehavior } from "@autumn/shared";
import { itemInCurrency } from "@/views/products/plan/utils/currencyUtils";
import {
	billedTierLabel,
	itemToVolumeExampleBill,
} from "@/views/products/plan/utils/volumeExampleBill";

const item = {
	feature_id: "messages",
	included_usage: 100,
	billing_units: 1,
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

describe("itemToVolumeExampleBill", () => {
	test("300 messages bill every message at the up-to-500 tier plus its flat fee", () => {
		const bill = itemToVolumeExampleBill({ item, usage: 300 });
		expect(bill).toMatchObject({ total: 35, billedUsage: 300, unitRate: 0.1 });
		expect(billedTierLabel(bill)).toBe("Up to 500");
	});

	test("usage within the included amount bills nothing", () => {
		const bill = itemToVolumeExampleBill({ item, usage: 100 });
		expect(bill.total).toBe(0);
		expect(billedTierLabel(bill)).toBe("Included");
	});

	test("usage past the last bound lands in the unlimited tier", () => {
		const bill = itemToVolumeExampleBill({ item, usage: 2500 });
		expect(bill.total).toBe(145);
		expect(billedTierLabel(bill)).toBe("Unlimited");
	});

	test("the EUR tab bills with the EUR prices", () => {
		const eurItem = itemInCurrency({ item, code: "eur", baseCurrency: "USD" });
		expect(itemToVolumeExampleBill({ item: eurItem, usage: 300 }).total).toBe(
			31.5,
		);
	});

	test("a blank EUR flat fee bills nothing, not the USD fee", () => {
		const eurItem = itemInCurrency({
			item: {
				...item,
				tiers: item.tiers?.map((tier) => ({
					...tier,
					additional_currencies: [{ currency: "eur", amount: 0.09 }],
				})),
			},
			code: "eur",
			baseCurrency: "USD",
		});
		expect(itemToVolumeExampleBill({ item: eurItem, usage: 300 }).total).toBe(
			27,
		);
	});
});
