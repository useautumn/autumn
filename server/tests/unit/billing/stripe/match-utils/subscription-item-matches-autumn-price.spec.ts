import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	type Price,
	PriceType,
	ProcessorType,
	type Product,
} from "@autumn/shared";
import type Stripe from "stripe";
import { subscriptionItemMatchesAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/subscriptionItemMatchesAutumnPrice";

const autumnPrice = ({ amount = 35 }: { amount?: number } = {}): Price =>
	({
		id: "price_internal",
		internal_product_id: "product_internal",
		config: {
			type: PriceType.Fixed,
			amount,
			interval: BillingInterval.Month,
			stripe_price_id: "price_current",
			feature_id: null,
			internal_feature_id: null,
		},
		proration_config: null,
	}) as Price;

const autumnProduct = (): Product =>
	({
		id: "transactional_pro_100k",
		internal_id: "product_internal",
		processor: {
			id: "prod_current",
			type: ProcessorType.Stripe,
			additional_ids: ["prod_legacy"],
		},
	}) as Product;

const stripeItem = ({
	priceId = "price_legacy",
	productId = "prod_legacy",
	unitAmount = 3500,
}: {
	priceId?: string;
	productId?: string;
	unitAmount?: number;
} = {}): Stripe.SubscriptionItem =>
	({
		id: "si_legacy",
		object: "subscription_item",
		quantity: 1,
		price: {
			id: priceId,
			object: "price",
			active: true,
			billing_scheme: "per_unit",
			currency: "usd",
			product: productId,
			recurring: {
				interval: "month",
				interval_count: 1,
				usage_type: "licensed",
			},
			tiers_mode: null,
			transform_quantity: null,
			type: "recurring",
			unit_amount: unitAmount,
			unit_amount_decimal: String(unitAmount),
		},
	}) as Stripe.SubscriptionItem;

describe("subscriptionItemMatchesAutumnPrice", () => {
	test("matches a fixed base through a configured legacy product alias and shape", () => {
		expect(
			subscriptionItemMatchesAutumnPrice({
				stripeSubscriptionItem: stripeItem(),
				price: autumnPrice(),
				product: autumnProduct(),
			}),
		).toBe(true);
	});

	test("does not let an alias bypass a different base-price shape", () => {
		expect(
			subscriptionItemMatchesAutumnPrice({
				stripeSubscriptionItem: stripeItem({ unitAmount: 5000 }),
				price: autumnPrice(),
				product: autumnProduct(),
			}),
		).toBe(false);
	});

	test("does not fall back through the primary product id", () => {
		expect(
			subscriptionItemMatchesAutumnPrice({
				stripeSubscriptionItem: stripeItem({ productId: "prod_current" }),
				price: autumnPrice(),
				product: autumnProduct(),
			}),
		).toBe(false);
	});
});
