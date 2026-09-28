import { expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
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
