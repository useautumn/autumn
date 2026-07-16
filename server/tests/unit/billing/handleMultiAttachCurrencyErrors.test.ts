import { describe, expect, test } from "bun:test";
import type {
	MultiAttachBillingContext,
	MultiAttachParamsV0,
	Price,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleMultiAttachCurrencyErrors } from "@/internal/billing/v2/actions/multiAttach/errors/handleMultiAttachCurrencyErrors";

const buildCtx = ({ multiCurrency = true }: { multiCurrency?: boolean } = {}) =>
	({
		org: { default_currency: "usd", config: { multi_currency: multiCurrency } },
	}) as unknown as AutumnContext;

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
	ctx = buildCtx(),
	customerCurrency = null,
	requestedCurrency,
	productPrices,
}: {
	ctx?: AutumnContext;
	customerCurrency?: string | null;
	requestedCurrency?: string;
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
		params: { currency: requestedCurrency } as MultiAttachParamsV0,
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
		).toThrow(/has no eur price/i);
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

	test("requested currency rejected when org lacks multi_currency", () => {
		expect(() =>
			run({
				ctx: buildCtx({ multiCurrency: false }),
				requestedCurrency: "eur",
				productPrices: [[paidWithEur]],
			}),
		).toThrow(/multi-currency is not enabled/i);
	});

	test("requested currency conflicting with the lock is rejected", () => {
		expect(() =>
			run({
				customerCurrency: "usd",
				requestedCurrency: "eur",
				productPrices: [[paidWithEur]],
			}),
		).toThrow(/locked to usd/i);
	});

	test("requested currency a plan does not offer is rejected", () => {
		expect(() =>
			run({
				requestedCurrency: "eur",
				productPrices: [[paidWithEur], [paidUsd]],
			}),
		).toThrow(/does not offer/i);
	});

	test("requested currency offered by every plan passes", () => {
		expect(() =>
			run({ requestedCurrency: "eur", productPrices: [[paidWithEur]] }),
		).not.toThrow();
	});
});
