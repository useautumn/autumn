import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type FixedPriceConfig,
	type FullCusProduct,
	type FullProduct,
	Infinite,
	type Price,
	PriceType,
	type SyncProductContext,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import { linkSyncedPricesToStripe } from "@/internal/billing/v2/actions/sync/setup/linkSyncedPricesToStripe";

const catalogMeteredPrice = (): Price =>
	({
		id: "pr_catalog_credits",
		internal_product_id: "prod_internal",
		entitlement_id: "ent_credits",
		is_custom: false,
		created_at: 1,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			should_prorate: false,
			interval: BillingInterval.Month,
			interval_count: 1,
			billing_units: 1,
			feature_id: "ai_credits",
			internal_feature_id: "fe_credits",
			usage_tiers: [{ to: Infinite, amount: 0.01 }],
			stripe_price_id: "price_catalog",
			stripe_product_id: "prod_catalog",
			stripe_meter_id: "mtr_catalog",
		},
	}) as unknown as Price;

const customBasePrice = (): Price =>
	({
		id: "pr_custom_base",
		internal_product_id: "prod_internal",
		entitlement_id: null,
		is_custom: true,
		created_at: 1,
		config: {
			type: PriceType.Fixed,
			amount: 6000,
			interval: BillingInterval.Year,
			interval_count: 1,
		},
	}) as unknown as Price;

const meteredStripePrice = ({
	id = "price_legacy",
	active = true,
	unitAmountDecimal = "1",
}: {
	id?: string;
	active?: boolean;
	unitAmountDecimal?: string;
} = {}): Stripe.Price =>
	({
		id,
		active,
		currency: "usd",
		product: "prod_legacy",
		billing_scheme: "per_unit",
		unit_amount: Number(unitAmountDecimal),
		unit_amount_decimal: unitAmountDecimal,
		transform_quantity: null,
		recurring: {
			interval: "month",
			interval_count: 1,
			usage_type: "metered",
			meter: "mtr_legacy",
		},
	}) as unknown as Stripe.Price;

const flatStripePrice = ({
	id = "price_flat",
	active = true,
}: {
	id?: string;
	active?: boolean;
} = {}): Stripe.Price =>
	({
		id,
		active,
		currency: "usd",
		product: "prod_flat",
		billing_scheme: "per_unit",
		unit_amount: 600000,
		unit_amount_decimal: "600000",
		transform_quantity: null,
		recurring: {
			interval: "year",
			interval_count: 1,
			usage_type: "licensed",
			meter: null,
		},
	}) as unknown as Stripe.Price;

const productContext = ({
	price = catalogMeteredPrice(),
	customPrices = [],
	currentCustomerProduct,
}: {
	price?: Price;
	customPrices?: Price[];
	currentCustomerProduct?: FullCusProduct;
} = {}): SyncProductContext =>
	({
		plan: { plan_id: "enterprise" },
		fullProduct: { id: "enterprise", prices: [price] } as FullProduct,
		customPrices,
		customEntitlements: [],
		featureQuantities: [],
		currentCustomerProduct,
	}) as unknown as SyncProductContext;

const linkOne = ({
	context,
	stripePrices,
}: {
	context: SyncProductContext;
	stripePrices: Stripe.Price[];
}) =>
	linkSyncedPricesToStripe({
		productContexts: [context],
		stripePrices,
		claimedStripePriceIds: new Set(),
	})[0];

const usageConfigOf = (price: Price | undefined) =>
	price?.config as UsagePriceConfig;

describe("linkSyncedPricesToStripe", () => {
	test("adopts the one active metered item billing the same price as a custom copy", () => {
		const linked = linkOne({
			context: productContext(),
			stripePrices: [meteredStripePrice()],
		});

		const [price] = linked?.fullProduct.prices ?? [];
		expect(price?.id).not.toBe("pr_catalog_credits");
		expect(price?.is_custom).toBe(true);
		expect(usageConfigOf(price).stripe_price_id).toBe("price_legacy");
		expect(usageConfigOf(price).stripe_product_id).toBe("prod_legacy");
		expect(usageConfigOf(price).stripe_meter_id).toBe("mtr_legacy");
		expect(linked?.customPrices).toEqual([price as Price]);
	});

	test("links a custom base price being created in place", () => {
		const base = customBasePrice();
		const linked = linkOne({
			context: productContext({ price: base, customPrices: [base] }),
			stripePrices: [flatStripePrice()],
		});

		const [price] = linked?.fullProduct.prices ?? [];
		const config = price?.config as FixedPriceConfig;
		expect(price?.id).toBe("pr_custom_base");
		expect(config.stripe_price_id).toBe("price_flat");
		expect(config.base_currency).toBe("usd");
		expect(linked?.customPrices).toEqual([price as Price]);
	});

	test("never adopts an archived price", () => {
		const context = productContext();
		expect(
			linkOne({
				context,
				stripePrices: [meteredStripePrice({ active: false })],
			}),
		).toBe(context);
	});

	test("does not guess between two matching items", () => {
		const context = productContext();
		expect(
			linkOne({
				context,
				stripePrices: [
					meteredStripePrice({ id: "price_a" }),
					meteredStripePrice({ id: "price_b" }),
				],
			}),
		).toBe(context);
	});

	test("skips an item billing a different amount", () => {
		const context = productContext();
		expect(
			linkOne({
				context,
				stripePrices: [meteredStripePrice({ unitAmountDecimal: "2" })],
			}),
		).toBe(context);
	});

	test("leaves a price already billed by an item on the phase alone", () => {
		const context = productContext();
		expect(
			linkOne({
				context,
				stripePrices: [
					meteredStripePrice({ id: "price_catalog" }),
					meteredStripePrice(),
				],
			}),
		).toBe(context);
	});

	test("never adopts an item another synced price already bills through", () => {
		const other = productContext({
			price: {
				...catalogMeteredPrice(),
				id: "pr_other",
				config: {
					...catalogMeteredPrice().config,
					stripe_price_id: "price_legacy",
				},
			} as Price,
		});
		const context = productContext();

		const [, linked] = linkSyncedPricesToStripe({
			productContexts: [other, context],
			stripePrices: [meteredStripePrice()],
			claimedStripePriceIds: new Set(),
		});
		expect(linked).toBe(context);
	});

	test("reuses the custom price a previous sync already linked", () => {
		const previouslyLinked = {
			...catalogMeteredPrice(),
			id: "pr_previously_linked",
			is_custom: true,
			config: {
				...catalogMeteredPrice().config,
				stripe_price_id: "price_legacy",
			},
		} as Price;
		const currentCustomerProduct = {
			customer_prices: [{ price: previouslyLinked }],
		} as unknown as FullCusProduct;

		const linked = linkOne({
			context: productContext({ currentCustomerProduct }),
			stripePrices: [meteredStripePrice()],
		});

		expect(linked?.fullProduct.prices[0]).toBe(previouslyLinked);
		expect(linked?.customPrices).toEqual([]);
	});
});
