/**
 * isUsableStripePrice
 *
 * Contract:
 *   retrieves the candidate's Stripe Price, then:
 *   live + same shape + currency → true
 *   missing / inactive / drift / wrong currency / usage autumn price → false
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillWhen,
	type FullProduct,
	type Price,
	PriceType,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const stripeProductId = "prod_pro";
const currency = "usd";

const mockState = {
	retrieveCalls: [] as string[],
	stripePrice: null as {
		id: string;
		active: boolean;
		currency?: string;
		unitAmount?: number;
	} | null,
};

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({}),
}));

await mockModuleWithRestore(
	"@/external/stripe/prices/operations/getStripePrice.js",
	() => ({
		getStripePrice: async ({ stripePriceId }: { stripePriceId: string }) => {
			mockState.retrieveCalls.push(stripePriceId);
			if (!mockState.stripePrice) return undefined;
			return {
				id: mockState.stripePrice.id,
				object: "price",
				active: mockState.stripePrice.active,
				currency: mockState.stripePrice.currency ?? "usd",
				billing_scheme: "per_unit",
				unit_amount: mockState.stripePrice.unitAmount ?? 2500,
				unit_amount_decimal: String(mockState.stripePrice.unitAmount ?? 2500),
				product: stripeProductId,
				recurring: {
					interval: "month",
					interval_count: 1,
					usage_type: "licensed",
				},
				type: "recurring",
			};
		},
	}),
);

const { isUsableStripePrice } = await import(
	"@/internal/products/stripeResourceUtils/findReusableStripeResources/isUsableStripePrice.js"
);

const ctx = {
	env: AppEnv.Sandbox,
	org: { id: "org_1", default_currency: "usd" },
} as unknown as AutumnContext;

const autumnFixed = (): Price => ({
	id: "pr_b",
	org_id: "org_1",
	created_at: 1_800_000_000_000,
	internal_product_id: "ip_pro",
	is_custom: true,
	config: {
		type: PriceType.Fixed,
		amount: 25,
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_product_id: null,
		feature_id: null,
		internal_feature_id: null,
	},
	proration_config: null,
});

const autumnUsage = (): Price => ({
	id: "pr_usage",
	org_id: "org_1",
	created_at: 1_800_000_000_000,
	internal_product_id: "ip_pro",
	is_custom: true,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1,
		internal_feature_id: "feat_messages",
		feature_id: "messages",
		usage_tiers: [{ amount: 25, to: TierInfinite }],
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_price_id: "price_usage_25",
	} satisfies UsagePriceConfig,
	proration_config: null,
});

const candidateFixed = (): Price => ({
	...autumnFixed(),
	id: "pr_a",
	config: {
		...autumnFixed().config,
		stripe_price_id: "price_a_25",
		stripe_product_id: stripeProductId,
	},
});

const product = ({
	targetPrice = autumnFixed(),
}: {
	targetPrice?: Price;
} = {}): FullProduct =>
	({
		id: "pro",
		internal_id: "ip_pro",
		org_id: "org_1",
		env: AppEnv.Sandbox,
		processor: { type: "stripe", id: stripeProductId },
		prices: [targetPrice],
		entitlements: [],
	}) as unknown as FullProduct;

const usable = ({
	targetPrice = autumnFixed(),
	candidate = candidateFixed(),
}: {
	targetPrice?: Price;
	candidate?: Price;
} = {}) =>
	isUsableStripePrice({
		ctx,
		targetPrice,
		candidate,
		product: product({ targetPrice }),
		currency,
	});

describe("isUsableStripePrice", () => {
	beforeEach(() => {
		mockState.retrieveCalls = [];
		mockState.stripePrice = null;
	});

	test("retrieves and returns true for a live matching Stripe Price", async () => {
		mockState.stripePrice = { id: "price_a_25", active: true };

		expect(await usable()).toBe(true);
		expect(mockState.retrieveCalls).toEqual(["price_a_25"]);
	});

	test("returns false for missing, inactive, drifted, or wrong-currency prices", async () => {
		expect(await usable()).toBe(false);
		expect(mockState.retrieveCalls).toEqual(["price_a_25"]);

		mockState.retrieveCalls = [];
		mockState.stripePrice = { id: "price_a_25", active: false };
		expect(await usable()).toBe(false);

		mockState.stripePrice = {
			id: "price_a_25",
			active: true,
			unitAmount: 2000,
		};
		expect(await usable()).toBe(false);

		mockState.stripePrice = { id: "price_a_25", active: true, currency: "eur" };
		expect(await usable()).toBe(false);
	});

	test("returns false for a usage autumn price without retrieving", async () => {
		expect(await usable({ targetPrice: autumnUsage() })).toBe(false);
		expect(mockState.retrieveCalls).toEqual([]);
	});
});

afterAll(() => {
	mock.restore();
});
