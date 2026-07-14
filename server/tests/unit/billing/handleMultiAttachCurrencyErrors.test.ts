import { describe, expect, test } from "bun:test";
import type { MultiAttachBillingContext, Price } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleMultiAttachCurrencyErrors } from "@/internal/billing/v2/actions/multiAttach/errors/handleMultiAttachCurrencyErrors";

const ctx = { org: { default_currency: "usd" } } as unknown as AutumnContext;

const price = (config: Record<string, unknown>): Price =>
	({ config }) as unknown as Price;

const paidUsd = price({ type: "fixed", amount: 10, interval: "month" });
const paidWithEur = price({
	type: "fixed",
	amount: 10,
	base_currency: "usd",
	currencies: { eur: { amount: 9 } },
});
const freeBase = price({ type: "fixed", amount: 0, interval: "month" });

const run = ({
	customerCurrency = null,
	productPrices,
}: {
	customerCurrency?: string | null;
	productPrices: Price[][];
}) =>
	handleMultiAttachCurrencyErrors({
		ctx,
		billingContext: {
			fullCustomer: { currency: customerCurrency },
			productContexts: productPrices.map((prices, i) => ({
				fullProduct: { name: `Plan ${i}`, prices },
			})),
		} as unknown as MultiAttachBillingContext,
	});

describe("handleMultiAttachCurrencyErrors", () => {
	test("unlocked customer on org-default plans passes", () => {
		expect(() =>
			run({ productPrices: [[paidUsd], [paidWithEur]] }),
		).not.toThrow();
	});

	test("blocks when ANY paid plan lacks the locked customer's currency", () => {
		expect(() =>
			run({
				customerCurrency: "eur",
				productPrices: [[paidWithEur], [paidUsd]],
			}),
		).toThrow(/does not offer/i);
	});

	test("all plans offering the locked currency pass", () => {
		expect(() =>
			run({ customerCurrency: "eur", productPrices: [[paidWithEur]] }),
		).not.toThrow();
	});

	test("free plans impose no constraint", () => {
		expect(() =>
			run({ customerCurrency: "eur", productPrices: [[freeBase]] }),
		).not.toThrow();
	});
});
