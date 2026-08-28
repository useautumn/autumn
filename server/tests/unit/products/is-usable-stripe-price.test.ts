/**
 * isUsableStripePrice
 *
 * Contract:
 *   retrieves the candidate's Stripe Price, then:
 *   live + same shape + currency → true
 *   missing / inactive / drift / wrong currency → false
 *   consumable matches the feature Stripe product (metered)
 *   prepaid retrieves V2 with expand tiers; included 100 vs 0 → miss
 *   usage without a paired entitlement → false after retrieve
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillWhen,
	type EntitlementWithFeature,
	type Feature,
	type FullProduct,
	type Price,
	PriceType,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const stripeProductId = "prod_pro";
const featureStripeProductId = "prod_feat_messages";
const currency = "usd";

const mockState = {
	retrieveCalls: [] as string[],
	expandCalls: [] as (string[] | undefined)[],
	stripePrice: null as {
		id: string;
		active: boolean;
		currency?: string;
		unitAmount?: number;
		product?: string;
		usageType?: "licensed" | "metered";
	} | null,
};

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({}),
}));

await mockModuleWithRestore(
	"@/external/stripe/prices/operations/getStripePrice.js",
	() => ({
		getStripePrice: async ({
			stripePriceId,
			expand,
		}: {
			stripePriceId: string;
			expand?: string[];
		}) => {
			mockState.retrieveCalls.push(stripePriceId);
			mockState.expandCalls.push(expand);
			if (!mockState.stripePrice) return undefined;
			return {
				id: mockState.stripePrice.id,
				object: "price",
				active: mockState.stripePrice.active,
				currency: mockState.stripePrice.currency ?? "usd",
				billing_scheme: "per_unit",
				unit_amount: mockState.stripePrice.unitAmount ?? 2500,
				unit_amount_decimal: String(mockState.stripePrice.unitAmount ?? 2500),
				product: mockState.stripePrice.product ?? stripeProductId,
				recurring: {
					interval: "month",
					interval_count: 1,
					usage_type: mockState.stripePrice.usageType ?? "licensed",
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

const autumnUsage = ({
	entitlementId = "ent_messages",
}: {
	entitlementId?: string;
} = {}): Price => ({
	id: "pr_usage",
	org_id: "org_1",
	created_at: 1_800_000_000_000,
	internal_product_id: "ip_pro",
	is_custom: true,
	entitlement_id: entitlementId,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1,
		internal_feature_id: "feat_messages",
		feature_id: "messages",
		usage_tiers: [{ amount: 25, to: TierInfinite }],
		interval: BillingInterval.Month,
		interval_count: 1,
		should_prorate: false,
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

const candidateUsage = (): Price => ({
	...autumnUsage(),
	id: "pr_usage_a",
	config: {
		...autumnUsage().config,
		stripe_price_id: "price_usage_25",
		stripe_product_id: featureStripeProductId,
	},
});

const messagesEntitlement = (): EntitlementWithFeature =>
	({
		id: "ent_messages",
		created_at: 1,
		internal_feature_id: "feat_messages",
		internal_product_id: "ip_pro",
		allowance: 0,
		feature_id: "messages",
		feature: {
			id: "messages",
			internal_id: "feat_messages",
			stripe_product_id: featureStripeProductId,
		} as Feature,
	}) as EntitlementWithFeature;

const product = ({
	targetPrice = autumnFixed(),
	entitlements = [],
}: {
	targetPrice?: Price;
	entitlements?: EntitlementWithFeature[];
} = {}): FullProduct =>
	({
		id: "pro",
		internal_id: "ip_pro",
		org_id: "org_1",
		env: AppEnv.Sandbox,
		processor: { type: "stripe", id: stripeProductId },
		prices: [targetPrice],
		entitlements,
	}) as unknown as FullProduct;

const usable = ({
	targetPrice = autumnFixed(),
	candidate = candidateFixed(),
	entitlements = [],
}: {
	targetPrice?: Price;
	candidate?: Price;
	entitlements?: EntitlementWithFeature[];
} = {}) =>
	isUsableStripePrice({
		ctx,
		targetPrice,
		candidate,
		product: product({ targetPrice, entitlements }),
		currency,
	});

describe("isUsableStripePrice", () => {
	beforeEach(() => {
		mockState.retrieveCalls = [];
		mockState.expandCalls = [];
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

	test("consumable matches a live metered Stripe Price on the feature product", async () => {
		mockState.stripePrice = {
			id: "price_usage_25",
			active: true,
			product: featureStripeProductId,
			usageType: "metered",
		};

		expect(
			await usable({
				targetPrice: autumnUsage(),
				candidate: candidateUsage(),
				entitlements: [messagesEntitlement()],
			}),
		).toBe(true);
		expect(mockState.retrieveCalls).toEqual(["price_usage_25"]);
	});

	test("prepaid retrieves the V2 slot with tiers and matches licensed shape", async () => {
		const target = autumnUsage();
		(target.config as UsagePriceConfig).bill_when = BillWhen.InAdvance;
		const candidate = candidateUsage();
		(candidate.config as UsagePriceConfig).bill_when = BillWhen.InAdvance;
		(candidate.config as UsagePriceConfig).stripe_price_id = "price_v1";
		(candidate.config as UsagePriceConfig).stripe_prepaid_price_v2_id =
			"price_v2";
		mockState.stripePrice = {
			id: "price_v2",
			active: true,
			product: featureStripeProductId,
			usageType: "licensed",
		};

		expect(
			await usable({
				targetPrice: target,
				candidate,
				entitlements: [messagesEntitlement()],
			}),
		).toBe(true);
		expect(mockState.retrieveCalls).toEqual(["price_v2"]);
		expect(mockState.expandCalls).toEqual([["tiers"]]);
	});

	test("prepaid included 100 misses a 0-included Stripe Price", async () => {
		const target = autumnUsage();
		(target.config as UsagePriceConfig).bill_when = BillWhen.InAdvance;
		const candidate = candidateUsage();
		(candidate.config as UsagePriceConfig).bill_when = BillWhen.InAdvance;
		(candidate.config as UsagePriceConfig).stripe_prepaid_price_v2_id =
			"price_v2_included0";
		const entitlement = messagesEntitlement();
		entitlement.allowance = 100;
		mockState.stripePrice = {
			id: "price_v2_included0",
			active: true,
			product: featureStripeProductId,
			usageType: "licensed",
		};

		expect(
			await usable({
				targetPrice: target,
				candidate,
				entitlements: [entitlement],
			}),
		).toBe(false);
		expect(mockState.retrieveCalls).toEqual(["price_v2_included0"]);
	});

	test("usage without a paired entitlement is unused after retrieve", async () => {
		mockState.stripePrice = {
			id: "price_usage_25",
			active: true,
			product: featureStripeProductId,
			usageType: "metered",
		};

		expect(
			await usable({
				targetPrice: autumnUsage(),
				candidate: candidateUsage(),
			}),
		).toBe(false);
		expect(mockState.retrieveCalls).toEqual(["price_usage_25"]);
	});
});

afterAll(() => {
	mock.restore();
});
