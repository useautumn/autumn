import { describe, expect, test } from "bun:test";
import { atmnToStripeAmount } from "@autumn/shared";

describe("convertAmountUtils", () => {
	test("converts decimal currencies to integer minor units", () => {
		expect(atmnToStripeAmount({ amount: 10.235, currency: "USD" })).toBe(1024);
	});

	test("rounds zero-decimal currencies to integer Stripe units", () => {
		expect(atmnToStripeAmount({ amount: 1000.5, currency: "JPY" })).toBe(1001);
	});
});
