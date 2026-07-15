import { describe, expect, test } from "bun:test";
import {
	atmnToStripeAmount,
	atmnToStripeAmountDecimal,
	stripeToAtmnAmount,
} from "./convertAmountUtils";

describe("atmnToStripeAmount", () => {
	test("two-decimal currencies scale by 100", () => {
		expect(atmnToStripeAmount({ amount: 18.5, currency: "usd" })).toBe(1850);
		expect(atmnToStripeAmount({ amount: 18.5, currency: "eur" })).toBe(1850);
	});

	test("zero-decimal currencies stay whole", () => {
		expect(atmnToStripeAmount({ amount: 1850, currency: "jpy" })).toBe(1850);
	});

	test("three-decimal currencies scale by 1000 and stay divisible by ten", () => {
		expect(atmnToStripeAmount({ amount: 1.234, currency: "bhd" })).toBe(1230);
		expect(atmnToStripeAmount({ amount: 5, currency: "kwd" })).toBe(5000);
		expect(atmnToStripeAmount({ amount: 5.23, currency: "kwd" })).toBe(5230);
	});
});

describe("atmnToStripeAmountDecimal", () => {
	test("scales by the currency factor", () => {
		expect(atmnToStripeAmountDecimal({ amount: 0.05, currency: "usd" })).toBe(
			"5",
		);
		expect(atmnToStripeAmountDecimal({ amount: 0.05, currency: "bhd" })).toBe(
			"50",
		);
		expect(atmnToStripeAmountDecimal({ amount: 50, currency: "jpy" })).toBe(
			"50",
		);
	});
});

describe("stripeToAtmnAmount round-trips", () => {
	test("divides out the currency factor", () => {
		expect(stripeToAtmnAmount({ amount: 1850, currency: "usd" })).toBe(18.5);
		expect(stripeToAtmnAmount({ amount: 1850, currency: "jpy" })).toBe(1850);
		expect(stripeToAtmnAmount({ amount: 1230, currency: "bhd" })).toBe(1.23);
	});
});
