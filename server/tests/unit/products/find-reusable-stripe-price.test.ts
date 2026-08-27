/**
 * findReusableStripePrice
 *
 * Contract:
 *   attach-currency slot already filled → no query, no retrieve
 *   newest full match + live Stripe → stamp that slot
 *   query miss / dead Stripe → leave empty
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillWhen,
	type FullProduct,
	getPriceCurrencyStripeId,
	type Price,
	PriceType,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const mockState = {
	queryCalls: 0,
	usageQueryCalls: 0,
	prepaidQueryCalls: 0,
	retrieveCalls: [] as string[],
	persistCalls: 0,
	candidate: null as Price | null,
	usageCandidate: null as Price | null,
	prepaidCandidate: null as Price | null,
	stripePrice: null as { id: string; active: boolean } | null,
};

await mockModuleWithRestore(
	"@/internal/products/prices/repos/priceRepo.js",
	() => ({
		priceRepo: {
			findNewestReusableFixedPrice: async () => {
				mockState.queryCalls += 1;
				return mockState.candidate;
			},
			findNewestReusablePrepaidPrice: async () => {
				mockState.prepaidQueryCalls += 1;
				return mockState.prepaidCandidate;
			},
			findNewestReusableUsagePrice: async () => {
				mockState.usageQueryCalls += 1;
				return mockState.usageCandidate;
			},
		},
	}),
);

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
				currency: "usd",
				billing_scheme: "per_unit",
				unit_amount: 2500,
				unit_amount_decimal: "2500",
				product: "prod_pro",
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

await mockModuleWithRestore(
	"@/internal/products/prices/PriceService.js",
	() => ({
		PriceService: {
			update: async () => {
				mockState.persistCalls += 1;
			},
		},
	}),
);

const { findReusableStripePrice } = await import(
	"@/internal/products/stripeResourceUtils/findReusableStripeResources/findReusableStripePrice.js"
);

const ctx = {
	db: {},
	env: AppEnv.Sandbox,
	org: { id: "org_1", default_currency: "usd" },
} as unknown as AutumnContext;

const fixedPrice = ({
	id,
	amount,
	stripePriceId = null,
}: {
	id: string;
	amount: number;
	stripePriceId?: string | null;
}): Price => ({
	id,
	org_id: "org_1",
	created_at: 1,
	internal_product_id: "ip_pro",
	is_custom: true,
	config: {
		type: PriceType.Fixed,
		amount,
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_price_id: stripePriceId,
		stripe_product_id: stripePriceId ? "prod_pro" : null,
		feature_id: null,
		internal_feature_id: null,
	},
	proration_config: null,
});

const product = ({ price }: { price: Price }): FullProduct =>
	({
		id: "pro",
		internal_id: "ip_pro",
		org_id: "org_1",
		env: AppEnv.Sandbox,
		processor: { type: "stripe", id: "prod_pro" },
		prices: [price],
		entitlements: [],
	}) as unknown as FullProduct;

describe("findReusableStripePrice", () => {
	beforeEach(() => {
		mockState.queryCalls = 0;
		mockState.usageQueryCalls = 0;
		mockState.prepaidQueryCalls = 0;
		mockState.retrieveCalls = [];
		mockState.persistCalls = 0;
		mockState.candidate = null;
		mockState.usageCandidate = null;
		mockState.prepaidCandidate = null;
		mockState.stripePrice = null;
	});

	test("skips query when the attach-currency slot is already filled", async () => {
		const price = fixedPrice({
			id: "pr_filled",
			amount: 20,
			stripePriceId: "price_catalog",
		});

		await findReusableStripePrice({
			ctx,
			products: [product({ price })],
			currency: "usd",
		});

		expect(mockState.queryCalls).toBe(0);
		expect(mockState.retrieveCalls).toEqual([]);
		expect(price.config.stripe_price_id).toBe("price_catalog");
	});

	test("stamps the attach-currency slot from a live borrowed Stripe Price", async () => {
		const target = fixedPrice({ id: "pr_b", amount: 25 });
		mockState.candidate = fixedPrice({
			id: "pr_a",
			amount: 25,
			stripePriceId: "price_a_25",
		});
		mockState.stripePrice = { id: "price_a_25", active: true };

		await findReusableStripePrice({
			ctx,
			products: [product({ price: target })],
			currency: "usd",
		});

		expect(mockState.queryCalls).toBe(1);
		expect(mockState.retrieveCalls).toEqual(["price_a_25"]);
		expect(
			getPriceCurrencyStripeId({
				config: target.config,
				currency: "usd",
				orgDefault: "usd",
				slot: "stripe_price_id",
			}),
		).toBe("price_a_25");
		expect(mockState.persistCalls).toBe(1);
	});

	test("leaves the slot empty when Stripe is dead or the query misses", async () => {
		const missed = fixedPrice({ id: "pr_miss", amount: 25 });
		await findReusableStripePrice({
			ctx,
			products: [product({ price: missed })],
			currency: "usd",
		});
		expect(missed.config.stripe_price_id).toBeNull();
		expect(mockState.retrieveCalls).toEqual([]);

		const dead = fixedPrice({ id: "pr_dead", amount: 25 });
		mockState.candidate = fixedPrice({
			id: "pr_a",
			amount: 25,
			stripePriceId: "price_dead",
		});
		mockState.stripePrice = { id: "price_dead", active: false };

		await findReusableStripePrice({
			ctx,
			products: [product({ price: dead })],
			currency: "usd",
		});

		expect(mockState.retrieveCalls).toEqual(["price_dead"]);
		expect(dead.config.stripe_price_id).toBeNull();
		expect(mockState.persistCalls).toBe(0);
	});

	test("usage empty slot queries the usage finder, not the fixed finder", async () => {
		const target: Price = {
			id: "pr_usage_b",
			org_id: "org_1",
			created_at: 1,
			internal_product_id: "ip_pro",
			is_custom: true,
			config: {
				type: PriceType.Usage,
				bill_when: BillWhen.EndOfPeriod,
				billing_units: 1,
				internal_feature_id: "ifeat_messages",
				feature_id: "messages",
				usage_tiers: [{ amount: 2, to: TierInfinite }],
				interval: BillingInterval.Month,
				interval_count: 1,
				should_prorate: false,
			} satisfies UsagePriceConfig,
			proration_config: null,
		};

		await findReusableStripePrice({
			ctx,
			products: [product({ price: target })],
			currency: "usd",
		});

		expect(mockState.usageQueryCalls).toBe(1);
		expect(mockState.prepaidQueryCalls).toBe(0);
		expect(mockState.queryCalls).toBe(0);
		expect(target.config.stripe_price_id).toBeUndefined();
	});

	test("prepaid empty V2 slot queries the prepaid finder, not usage", async () => {
		const target: Price = {
			id: "pr_prepaid_b",
			org_id: "org_1",
			created_at: 1,
			internal_product_id: "ip_pro",
			is_custom: true,
			config: {
				type: PriceType.Usage,
				bill_when: BillWhen.InAdvance,
				billing_units: 100,
				internal_feature_id: "ifeat_messages",
				feature_id: "messages",
				usage_tiers: [{ amount: 10, to: TierInfinite }],
				interval: BillingInterval.Month,
				interval_count: 1,
				should_prorate: false,
			} satisfies UsagePriceConfig,
			proration_config: null,
		};

		await findReusableStripePrice({
			ctx,
			products: [product({ price: target })],
			currency: "usd",
		});

		expect(mockState.prepaidQueryCalls).toBe(1);
		expect(mockState.usageQueryCalls).toBe(0);
		expect(mockState.queryCalls).toBe(0);
		expect(
			(target.config as UsagePriceConfig).stripe_prepaid_price_v2_id,
		).toBeUndefined();
	});
});

afterAll(() => {
	mock.restore();
});
