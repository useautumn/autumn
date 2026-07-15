import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	type FixedPriceConfig,
	type FullProduct,
	type Price,
	PriceType,
	type SyncBillingContext,
} from "@autumn/shared";
import type Stripe from "stripe";
import { rollupMatchedPlans } from "@/internal/billing/v2/actions/sync/detect/rollupMatchedPlans";
import type { ItemDiff } from "@/internal/billing/v2/actions/sync/detect/types";
import { syncContextHasPaidProduct } from "@/internal/billing/v2/actions/sync/utils/syncContextUtils";
import { autumnBasePriceToStripePriceShape } from "@/internal/billing/v2/providers/stripe/utils/matchUtils/autumnPriceShape";
import { normalizeSubscriptionPhases } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/normalizeSubscriptionPhases";
import { resolveStripeSyncCurrency } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/resolveStripeSyncCurrency";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";

const stripePrice = {
	id: "price_shared",
	product: "prod_stripe",
	currency: "usd",
	unit_amount: 5000,
	unit_amount_decimal: "5000",
	currency_options: {
		eur: { unit_amount: 4500, unit_amount_decimal: "4500" },
		gbp: { unit_amount: 3900, unit_amount_decimal: "3900" },
		jpy: { unit_amount: 6000, unit_amount_decimal: "6000" },
	},
	billing_scheme: "per_unit",
	tiers_mode: null,
	recurring: { interval: "month", interval_count: 3, usage_type: "licensed" },
} as unknown as Stripe.Price;

const subscription = ({ currency }: { currency: string }) =>
	({
		id: `sub_${currency}`,
		currency,
		start_date: 1,
		items: {
			data: [
				{
					id: "si_1",
					price: stripePrice,
					quantity: 2,
					current_period_start: 1,
					metadata: {},
				},
			],
		},
	}) as Stripe.Subscription;

const schedule = () =>
	({
		id: "sub_sched_1",
		phases: [
			{
				start_date: 1,
				end_date: 2,
				currency: "usd",
				items: [{ price: stripePrice, quantity: 2, metadata: {} }],
			},
		],
	}) as Stripe.SubscriptionSchedule;

describe("Stripe sync currency normalization", () => {
	test.each([
		["eur", 4500],
		["gbp", 3900],
		["jpy", 6000],
	])("uses the %s currency option", (currency, amount) => {
		const [phase] = normalizeSubscriptionPhases({
			subscription: subscription({ currency }),
		});

		expect(phase?.items[0]).toMatchObject({
			stripe_price_id: "price_shared",
			currency,
			unit_amount: amount,
			unit_amount_decimal: String(amount),
			recurring_interval: "month",
			recurring_interval_count: 3,
			quantity: 2,
		});
	});

	test("uses the live subscription currency for schedule phases", () => {
		const [phase] = normalizeSubscriptionPhases({
			subscription: subscription({ currency: "eur" }),
			schedule: schedule(),
		});

		expect(phase?.items[0]).toMatchObject({
			currency: "eur",
			unit_amount: 4500,
		});
	});

	test("uses the existing customer currency for a schedule-only sync", () => {
		const [phase] = normalizeSubscriptionPhases({
			schedule: schedule(),
			billingCurrency: "gbp",
		});

		expect(phase?.items[0]).toMatchObject({
			currency: "gbp",
			unit_amount: 3900,
		});
	});

	test("rejects an ambiguous schedule-only multi-currency Price", () => {
		expect(() =>
			normalizeSubscriptionPhases({ schedule: schedule() }),
		).toThrow();
	});

	test("rejects an unsupported locked customer currency", () => {
		expect(() =>
			resolveStripeSyncCurrency({
				schedule: schedule(),
				customerCurrency: "cad",
			}),
		).toThrow();
	});
});

const catalogPrice = {
	id: "pr_catalog",
	config: {
		type: PriceType.Fixed,
		amount: 4500,
		interval: BillingInterval.Month,
		interval_count: 3,
		stripe_price_id: "price_catalog",
		base_currency: "jpy",
	},
} as Price & { config: FixedPriceConfig };
const product = {
	id: "quarterly",
	internal_id: "prod_internal",
	is_add_on: false,
	base_variant_id: null,
	prices: [catalogPrice],
} as FullProduct;
const snapshot = {
	id: "si_1",
	stripe_price_id: "price_shared",
	stripe_product_id: "prod_stripe",
	unit_amount: 4500,
	unit_amount_decimal: "4500",
	currency: "jpy",
	quantity: 1,
	billing_scheme: "per_unit",
	tiers_mode: null,
	tiers: null,
	recurring_interval: "month",
	recurring_interval_count: 3,
	recurring_usage_type: "licensed",
	metadata: {},
} satisfies StripeItemSnapshot;

const itemDiff = ({
	exact,
	stripe = snapshot,
}: {
	exact: boolean;
	stripe?: StripeItemSnapshot;
}): ItemDiff => ({
	stripe,
	match: {
		kind: "autumn_price",
		matched_on: exact
			? { type: "stripe_price_id", stripe_price_id: "price_shared" }
			: {
					type: "stripe_base_price_shape",
					stripe_product_id: "prod_stripe",
					stripe_price_id: "price_shared",
				},
		price: catalogPrice,
		product,
	},
});

describe("Stripe sync base rollup", () => {
	test("keeps an exact source Price ID as a catalog match", () => {
		const [plan] = rollupMatchedPlans({
			itemDiffs: [itemDiff({ exact: true })],
		});

		expect(plan?.base.kind).toBe("matched");
		expect(plan?.customize).toBeUndefined();
	});

	test("preserves a shape-matched source as a JPY quarterly custom base", () => {
		const [plan] = rollupMatchedPlans({
			itemDiffs: [itemDiff({ exact: false })],
		});

		expect(plan?.base.kind).toBe("custom");
		expect(plan?.customize?.price).toEqual({
			amount: 4500,
			interval: BillingInterval.Month,
			interval_count: 3,
			base_currency: "jpy",
			stripe_price_id: "price_shared",
		});
	});

	test("does not coerce a missing Stripe amount to zero", () => {
		const [plan] = rollupMatchedPlans({
			itemDiffs: [
				itemDiff({
					exact: false,
					stripe: {
						...snapshot,
						unit_amount: null,
						unit_amount_decimal: null,
					},
				}),
			],
		});

		expect(plan?.base.kind).toBe("dropped");
		expect(plan?.customize?.price).toBeNull();
	});
});

test("detects a product paid only in the sync currency", () => {
	const syncContext = {
		currency: "eur",
		immediatePhase: {
			productContexts: [
				{
					fullProduct: {
						...product,
						prices: [
							{
								...catalogPrice,
								config: {
									...catalogPrice.config,
									amount: 0,
									base_currency: "usd",
									currencies: { eur: { amount: 10 } },
								},
							},
						],
					},
				},
			],
		},
		futurePhases: [],
	} as unknown as SyncBillingContext;

	expect(syncContextHasPaidProduct({ syncContext })).toBe(true);
});

describe("Autumn base price currency shape", () => {
	test("does not fall back to an explicit base currency", () => {
		expect(
			autumnBasePriceToStripePriceShape({
				price: catalogPrice,
				stripeProductId: "prod_stripe",
				currency: "eur",
			}),
		).toBeNull();
	});

	test("keeps legacy single-currency configs", () => {
		expect(
			autumnBasePriceToStripePriceShape({
				price: {
					...catalogPrice,
					config: { ...catalogPrice.config, base_currency: undefined },
				},
				stripeProductId: "prod_stripe",
				currency: "eur",
			}),
		).not.toBeNull();
	});
});
