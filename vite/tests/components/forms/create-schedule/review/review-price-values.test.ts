import { expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import { compactPriceLabel } from "@/components/forms/create-schedule/utils/review/compactPriceLabel";
import { processorItemsTotal } from "@/components/forms/create-schedule/utils/review/processorItemPriceLabels";
import { recurringTotalLabel } from "@/components/forms/create-schedule/utils/review/recurringTotalLabel";
import { shortStripeId } from "@/components/forms/create-schedule/utils/review/shortStripeId";
import { splitPriceLabel } from "@/components/forms/create-schedule/utils/review/splitPriceLabel";
import { monthlyPrice, processorItem } from "./reviewFixtures";

const planWithBasePrice = (
	price: number,
	interval: string,
	intervalCount = 1,
) =>
	({
		items: [{ price, interval, interval_count: intervalCount }],
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

test("phase totals flag usage-based items they can't sum", () => {
	const licensed = processorItem({});
	const meteredItem = processorItem({
		amount: null,
		price: licensed.price && { ...licensed.price, usage_type: "metered" },
	});

	expect(processorItemsTotal([licensed])).toBe("$50/mo");
	expect(processorItemsTotal([licensed, meteredItem])).toBe("$50/mo + usage");
});

test("price labels abbreviate single and multi-count intervals alike", () => {
	expect(compactPriceLabel("$20 per month")).toBe("$20/mo");
	expect(compactPriceLabel("$20 per quarter")).toBe("$20/qtr");
	expect(compactPriceLabel("$20 per 3 months")).toBe("$20/3 mo");
	expect(compactPriceLabel("$20 per 2 years")).toBe("$20/2 yr");
	expect(compactPriceLabel("$20 per half year")).toBe("$20 per half year");
	expect(compactPriceLabel("$20 one-off")).toBe("$20 one-off");
});

test("multi-count intervals render the same across base and Stripe totals", () => {
	expect(
		recurringTotalLabel({
			products: [planWithBasePrice(50, "month", 3)],
			currency: "usd",
		}),
	).toBe("$50/3 mo");
	expect(
		processorItemsTotal([
			processorItem({ price: { ...monthlyPrice(50), interval_count: 3 } }),
		]),
	).toBe("$50/3 mo");
});
