import { describe, expect, test } from "bun:test";
import type { Organization } from "../../models/orgModels/orgTable.js";
import { resolveCustomerCurrency } from "./resolveCustomerCurrency.js";

const orgWith = (defaultCurrency: string | null): Organization =>
	({ default_currency: defaultCurrency }) as Organization;

describe("resolveCustomerCurrency", () => {
	test("requested wins over customer currency and org default", () => {
		expect(
			resolveCustomerCurrency({
				customer: { currency: "gbp" },
				org: orgWith("usd"),
				requested: "eur",
			}),
		).toBe("eur");
	});

	test("falls back to customer currency when nothing requested", () => {
		expect(
			resolveCustomerCurrency({
				customer: { currency: "gbp" },
				org: orgWith("usd"),
			}),
		).toBe("gbp");
	});

	test("falls back to org default when customer has no currency", () => {
		expect(
			resolveCustomerCurrency({
				customer: { currency: null },
				org: orgWith("usd"),
			}),
		).toBe("usd");
	});

	test("lowercases the resolved currency from every source", () => {
		expect(
			resolveCustomerCurrency({
				customer: null,
				org: orgWith("usd"),
				requested: "EUR",
			}),
		).toBe("eur");
		expect(
			resolveCustomerCurrency({
				customer: { currency: "GBP" },
				org: orgWith("usd"),
			}),
		).toBe("gbp");
		expect(
			resolveCustomerCurrency({
				customer: { currency: null },
				org: orgWith("USD"),
			}),
		).toBe("usd");
	});

	test("empty requested string falls through to the next source", () => {
		expect(
			resolveCustomerCurrency({
				customer: { currency: "gbp" },
				org: orgWith("usd"),
				requested: "",
			}),
		).toBe("gbp");
	});

	test("defaults to usd when org has no default currency", () => {
		expect(
			resolveCustomerCurrency({
				customer: { currency: null },
				org: orgWith(null),
			}),
		).toBe("usd");
	});

	test("resolves without a customer", () => {
		expect(resolveCustomerCurrency({ org: orgWith("eur") })).toBe("eur");
	});
});
