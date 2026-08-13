import { describe, expect, test } from "bun:test";
import { basePriceToKey, BillingInterval } from "@autumn/shared";

type BasePriceParams = Parameters<typeof basePriceToKey>[0]["price"];

const month = {
	amount: 20,
	interval: BillingInterval.Month,
};

const price = (overrides: Record<string, unknown> = {}) =>
	({ ...month, ...overrides }) as BasePriceParams;

const keyOf = (value: BasePriceParams) => basePriceToKey({ price: value });

const expectSame = (a: BasePriceParams, b: BasePriceParams, expected: boolean) => {
	expect(keyOf(a) === keyOf(b)).toBe(expected);
	expect(keyOf(b) === keyOf(a)).toBe(expected);
};

describe("basePriceToKey", () => {
	test("identical baselines are same", () => {
		expectSame(price(), price(), true);
	});

	describe("amount (0 is preserved)", () => {
		test("equal amounts are same, different amounts differ", () => {
			expectSame(price({ amount: 20 }), price({ amount: 20 }), true);
			expectSame(price({ amount: 20 }), price({ amount: 30 }), false);
		});

		test("0 vs a real amount differ; 0 equals 0", () => {
			expectSame(price({ amount: 0 }), price({ amount: 0 }), true);
			expectSame(price({ amount: 0 }), price({ amount: 20 }), false);
		});
	});

	describe("interval (strict)", () => {
		test("equal intervals are same, different intervals differ", () => {
			expectSame(
				price({ interval: BillingInterval.Month }),
				price({ interval: BillingInterval.Month }),
				true,
			);
			expectSame(
				price({ interval: BillingInterval.Month }),
				price({ interval: BillingInterval.Year }),
				false,
			);
		});
	});

	describe("interval_count (unset means 1)", () => {
		test("unset / null equal 1; 1 vs 2 differ", () => {
			expectSame(price({ interval_count: undefined }), price({ interval_count: 1 }), true);
			expectSame(price({ interval_count: null }), price({ interval_count: 1 }), true);
			expectSame(price(), price({ interval_count: 1 }), true);
			expectSame(price({ interval_count: 1 }), price({ interval_count: 2 }), false);
			expectSame(price({ interval_count: undefined }), price({ interval_count: 2 }), false);
		});

		test("0 is preserved (not collapsed to 1)", () => {
			expectSame(price({ interval_count: 0 }), price({ interval_count: 1 }), false);
		});
	});

	describe("additional_currencies", () => {
		test("omitted, null, and empty are same", () => {
			expectSame(price(), price({ additional_currencies: [] }), true);
			expectSame(
				price({ additional_currencies: null }),
				price({ additional_currencies: [] }),
				true,
			);
			expectSame(price({ additional_currencies: undefined }), price(), true);
		});

		test("present vs absent differ; amounts differ", () => {
			expectSame(
				price({ additional_currencies: [{ currency: "eur", amount: 18 }] }),
				price(),
				false,
			);
			expectSame(
				price({ additional_currencies: [{ currency: "eur", amount: 18 }] }),
				price({ additional_currencies: [{ currency: "eur", amount: 19 }] }),
				false,
			);
			expectSame(
				price({ additional_currencies: [{ currency: "eur", amount: 18 }] }),
				price({ additional_currencies: [{ currency: "gbp", amount: 18 }] }),
				false,
			);
		});

		test("0 amount is preserved (not collapsed to omitted)", () => {
			expectSame(
				price({ additional_currencies: [{ currency: "eur", amount: 0 }] }),
				price({ additional_currencies: [{ currency: "eur", amount: null }] }),
				false,
			);
			expectSame(
				price({ additional_currencies: [{ currency: "eur", amount: 0 }] }),
				price({ additional_currencies: [{ currency: "eur" }] }),
				false,
			);
		});

		test("order does not matter; currency code is case-insensitive", () => {
			expectSame(
				price({
					additional_currencies: [
						{ currency: "eur", amount: 18 },
						{ currency: "gbp", amount: 16 },
					],
				}),
				price({
					additional_currencies: [
						{ currency: "gbp", amount: 16 },
						{ currency: "eur", amount: 18 },
					],
				}),
				true,
			);
			expectSame(
				price({ additional_currencies: [{ currency: "EUR", amount: 18 }] }),
				price({ additional_currencies: [{ currency: "eur", amount: 18 }] }),
				true,
			);
		});
	});

	describe("internal fields (ignored)", () => {
		test("entitlement_id / price_id / stripe_price_id / base_currency do not affect the key", () => {
			expectSame(
				price({
					entitlement_id: "ent_a",
					price_id: "pr_a",
					stripe_price_id: "price_a",
					base_currency: "usd",
				}),
				price({
					entitlement_id: "ent_b",
					price_id: "pr_b",
					stripe_price_id: "price_b",
					base_currency: "eur",
				}),
				true,
			);
			expectSame(
				price({ stripe_price_id: "price_a", base_currency: "usd" }),
				price(),
				true,
			);
		});
	});
});
