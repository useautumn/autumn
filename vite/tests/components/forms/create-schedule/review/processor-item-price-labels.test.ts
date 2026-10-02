import { expect, test } from "bun:test";
import {
	pricingTableTotal,
	pricingTableUnitPrice,
} from "@/components/forms/create-schedule/utils/review/processorItemPriceLabels";
import { monthlyPrice, processorItem } from "./reviewFixtures";

test("amounts keep the currency's own decimal places", () => {
	const yenPrice = { ...monthlyPrice(1000), currency: "jpy" };
	const dinarPrice = { ...monthlyPrice(12.5), currency: "kwd" };

	expect(pricingTableUnitPrice(yenPrice)).toBe("JP¥1,000 / month");
	expect(
		pricingTableTotal(processorItem({ price: dinarPrice, amount: 12.5 })),
	).toEqual({ amount: "KWD 12.500 / month" });
	expect(pricingTableUnitPrice(monthlyPrice(50))).toBe("US$50.00 / month");
});

test("a unit price below the currency's precision still shows its digits", () => {
	expect(
		pricingTableUnitPrice({
			...monthlyPrice(0.001),
			usage_type: "metered",
		}),
	).toBe("US$0.001 per unit / month");
});

test("a licensed price billed per bundle of units names the bundle", () => {
	expect(
		pricingTableUnitPrice({ ...monthlyPrice(10), units_per_quantity: 100 }),
	).toBe("US$10.00 per 100 units / month");
});
