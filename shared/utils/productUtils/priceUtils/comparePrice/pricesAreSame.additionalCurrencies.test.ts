import { describe, expect, test } from "bun:test";
import { pricesAreSame } from "./pricesAreSame.js";

// biome-ignore lint/suspicious/noExplicitAny: test fixture
const fixedPrice = (config: any) => ({ config, proration_config: null }) as any;

describe("pricesAreSame: additional currencies", () => {
	const base = { type: "fixed", amount: 10, interval: "month" };

	test("differing per-currency amounts are not the same", () => {
		expect(
			pricesAreSame(
				fixedPrice({ ...base, currencies: { eur: { amount: 9 } } }),
				fixedPrice({ ...base, currencies: { eur: { amount: 8 } } }),
			),
		).toBe(false);
	});

	test("identical currencies are the same", () => {
		expect(
			pricesAreSame(
				fixedPrice({ ...base, currencies: { eur: { amount: 9 } } }),
				fixedPrice({ ...base, currencies: { eur: { amount: 9 } } }),
			),
		).toBe(true);
	});

	test("adding a currency is a change", () => {
		expect(
			pricesAreSame(
				fixedPrice({ ...base }),
				fixedPrice({ ...base, currencies: { eur: { amount: 9 } } }),
			),
		).toBe(false);
	});

	test("differing base_currency is a change", () => {
		expect(
			pricesAreSame(
				fixedPrice({
					...base,
					base_currency: "usd",
					currencies: { eur: { amount: 9 } },
				}),
				fixedPrice({
					...base,
					base_currency: "gbp",
					currencies: { eur: { amount: 9 } },
				}),
			),
		).toBe(false);
	});

	test("single-currency prices (no currencies) stay the same", () => {
		expect(
			pricesAreSame(fixedPrice({ ...base }), fixedPrice({ ...base })),
		).toBe(true);
	});
});
