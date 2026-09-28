import { expect, test } from "bun:test";
import type { ProcessorItem, ProductV2 } from "@autumn/shared";
import { processorItemsTotal } from "@/components/forms/create-schedule/utils/review/processorItemPriceLabels";
import { recurringTotalLabel } from "@/components/forms/create-schedule/utils/review/recurringTotalLabel";
import { shortStripeId } from "@/components/forms/create-schedule/utils/review/shortStripeId";
import { splitPriceLabel } from "@/components/forms/create-schedule/utils/review/splitPriceLabel";

const planWithBasePrice = (price: number, interval: string) =>
	({
		items: [{ price, interval, interval_count: 1 }],
	}) as unknown as ProductV2;

test("price labels split the amount from the unit", () => {
	expect(splitPriceLabel("$50/mo")).toEqual({ amount: "$50", suffix: "/mo" });
	expect(splitPriceLabel("From $5/100 credits +1")).toEqual({
		amount: "From $5",
		suffix: "/100 credits +1",
	});
	expect(splitPriceLabel("Free")).toEqual({ amount: "Free" });
});

test("phase totals sum base prices on a shared interval only", () => {
	expect(
		recurringTotalLabel({
			products: [
				planWithBasePrice(50, "month"),
				planWithBasePrice(30, "month"),
			],
			currency: "usd",
		}),
	).toBe("$80/mo");
	expect(
		recurringTotalLabel({
			products: [
				planWithBasePrice(50, "month"),
				planWithBasePrice(300, "year"),
			],
			currency: "usd",
		}),
	).toBeUndefined();
});

test("short Stripe ids keep the prefix and tail", () => {
	expect(shortStripeId("sub_1Q2wXcAutumnDemo")).toBe("sub_…mnDemo");
	expect(shortStripeId("sub_1")).toBe("sub_1");
});

const monthlyItem = (overrides: Partial<ProcessorItem>): ProcessorItem => ({
	item_id: null,
	price_id: null,
	plan_id: "pro",
	feature_id: null,
	display_name: "Pro",
	feature_name: null,
	quantity: 1,
	price: {
		currency: "usd",
		unit_amount: 50,
		interval: "month",
		interval_count: 1,
		usage_type: "licensed",
		tiers_mode: null,
		tiers: null,
		units_per_quantity: null,
	},
	amount: 50,
	creates_price: false,
	managed_by_autumn: true,
	...overrides,
});

test("phase totals flag usage-based items they can't sum", () => {
	const licensed = monthlyItem({});
	const meteredItem = monthlyItem({
		amount: null,
		price: licensed.price && { ...licensed.price, usage_type: "metered" },
	});

	expect(processorItemsTotal([licensed])).toBe("$50/mo");
	expect(processorItemsTotal([licensed, meteredItem])).toBe("$50/mo + usage");
});
