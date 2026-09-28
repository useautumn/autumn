import { expect, test } from "bun:test";
import { compactPriceLabel } from "@/components/forms/create-schedule/utils/review/compactPriceLabel";
import { shortStripeId } from "@/components/forms/create-schedule/utils/review/shortStripeId";
import { splitPriceLabel } from "@/components/forms/create-schedule/utils/review/splitPriceLabel";

test("price labels split the amount from the unit", () => {
	expect(splitPriceLabel("$50/mo")).toEqual({ amount: "$50", suffix: "/mo" });
	expect(splitPriceLabel("From $5/100 credits +1")).toEqual({
		amount: "From $5",
		suffix: "/100 credits +1",
	});
	expect(splitPriceLabel("Free")).toEqual({ amount: "Free" });
});

test("short Stripe ids keep the prefix and tail", () => {
	expect(shortStripeId("sub_1Q2wXcAutumnDemo")).toBe("sub_…mnDemo");
	expect(shortStripeId("sub_1")).toBe("sub_1");
});

test("price labels abbreviate single and multi-count intervals alike", () => {
	expect(compactPriceLabel("$20 per month")).toBe("$20/mo");
	expect(compactPriceLabel("$20 per quarter")).toBe("$20/qtr");
	expect(compactPriceLabel("$20 per 3 months")).toBe("$20/3 mo");
	expect(compactPriceLabel("$20 per 2 years")).toBe("$20/2 yr");
	expect(compactPriceLabel("$20 per half year")).toBe("$20 per half year");
	expect(compactPriceLabel("$20 one-off")).toBe("$20 one-off");
});
