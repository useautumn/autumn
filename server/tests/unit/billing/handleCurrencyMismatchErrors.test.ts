import { describe, expect, test } from "bun:test";
import type {
	AttachBillingContext,
	AttachParamsV1,
	Price,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleCurrencyMismatchErrors } from "@/internal/billing/v2/actions/attach/errors/handleCurrencyMismatchErrors";

const ctx = {
	org: { default_currency: "usd", config: { multi_currency: true } },
} as unknown as AutumnContext;

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
const paidUsageUsd = price({
	type: "usage",
	usage_tiers: [{ to: "inf", amount: 0.5 }],
});

const run = ({
	customerCurrency = null,
	stripeCurrency = null,
	prices,
	requested,
}: {
	customerCurrency?: string | null;
	stripeCurrency?: string | null;
	prices: Price[];
	requested?: string;
}) =>
	handleCurrencyMismatchErrors({
		ctx,
		billingContext: {
			fullCustomer: { currency: customerCurrency },
			stripeCustomer: stripeCurrency ? { currency: stripeCurrency } : null,
			attachProduct: { name: "Pro", prices },
		} as unknown as AttachBillingContext,
		params: { currency: requested } as AttachParamsV1,
	});

describe("handleCurrencyMismatchErrors", () => {
	test("free plans impose no currency constraint", () => {
		expect(() =>
			run({ customerCurrency: "gbp", prices: [freeBase], requested: "eur" }),
		).not.toThrow();
	});

	test("paid org-default plan attaches when nothing is requested", () => {
		expect(() => run({ prices: [paidUsd] })).not.toThrow();
	});

	test("blocks when the requested currency is not offered by the plan", () => {
		expect(() => run({ prices: [paidUsd], requested: "eur" })).toThrow(
			/does not offer/i,
		);
	});

	test("allows a requested currency the plan offers", () => {
		expect(() =>
			run({ prices: [paidWithEur], requested: "eur" }),
		).not.toThrow();
	});

	test("blocks a locked customer from switching currencies", () => {
		expect(() =>
			run({ customerCurrency: "usd", prices: [paidWithEur], requested: "eur" }),
		).toThrow(/locked/i);
	});

	test("locked customer attaches a plan offering their currency", () => {
		expect(() =>
			run({ customerCurrency: "usd", prices: [paidUsd] }),
		).not.toThrow();
	});

	test("blocks when the plan does not offer the locked customer's currency", () => {
		expect(() => run({ customerCurrency: "eur", prices: [paidUsd] })).toThrow(
			/does not offer/i,
		);
	});

	test("checks paid usage prices, ignoring a free base price", () => {
		expect(() =>
			run({ prices: [freeBase, paidUsageUsd], requested: "eur" }),
		).toThrow(/does not offer/i);
	});

	test("currency comparison is case-insensitive", () => {
		expect(() =>
			run({ customerCurrency: "usd", prices: [paidUsd], requested: "USD" }),
		).not.toThrow();
	});

	test("an id-only currency block does not count as an offered currency", () => {
		const idOnlyEur = price({
			type: "fixed",
			amount: 10,
			base_currency: "usd",
			currencies: { eur: { stripe_price_id: "price_eur" } },
		});
		expect(() => run({ prices: [idOnlyEur], requested: "eur" })).toThrow(
			/does not offer/i,
		);
	});

	test("a usage price needs non-empty per-currency usage_tiers to offer a currency", () => {
		const emptyTiersEur = price({
			type: "usage",
			usage_tiers: [{ to: "inf", amount: 0.5 }],
			base_currency: "usd",
			currencies: { eur: { usage_tiers: [] } },
		});
		expect(() => run({ prices: [emptyTiersEur], requested: "eur" })).toThrow(
			/does not offer/i,
		);
	});

	test("legacy null-currency customer is locked by Stripe's customer currency", () => {
		expect(() =>
			run({
				customerCurrency: null,
				stripeCurrency: "usd",
				prices: [paidWithEur],
				requested: "eur",
			}),
		).toThrow(/locked/i);
	});

	test("requested currency is rejected when the org flag is off", () => {
		const flagOffCtx = {
			org: { default_currency: "usd", config: { multi_currency: false } },
		} as unknown as AutumnContext;
		expect(() =>
			handleCurrencyMismatchErrors({
				ctx: flagOffCtx,
				billingContext: {
					fullCustomer: { currency: null },
					stripeCustomer: null,
					attachProduct: { name: "Pro", prices: [paidWithEur] },
				} as unknown as AttachBillingContext,
				params: { currency: "eur" } as AttachParamsV1,
			}),
		).toThrow(/not enabled/i);
	});
});
