import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import {
	findMatchingInlinePriceIdForPhaseItem,
	findMatchingInlineSubscriptionItem,
	stripeInlinePriceMatchesStripePrice,
} from "@/internal/billing/v2/providers/stripe/utils/matchUtils/matchStripeInlinePrice";

const inlinePrice = {
	product: "stripe_prod_inline",
	currency: "usd",
	recurring: { interval: "month" as const, interval_count: 1 },
	unit_amount_decimal: "1000",
};

const subscriptionItem = ({
	id = "si_inline",
	customerPriceId = "cus_price_inline",
	priceMetadataId = "price_inline_autumn",
	priceId = "price_inline",
	interval = "month",
	amount = "1000",
}: {
	id?: string;
	customerPriceId?: string | null;
	priceMetadataId?: string;
	priceId?: string;
	interval?: Stripe.Price.Recurring.Interval;
	amount?: string;
} = {}) =>
	({
		id,
		metadata: {
			...(customerPriceId && { autumn_customer_price_id: customerPriceId }),
			autumn_price_id: priceMetadataId,
		},
		price: {
			id: priceId,
			object: "price",
			product: { id: "stripe_prod_inline" },
			currency: "usd",
			recurring: { interval, interval_count: 1 },
			unit_amount_decimal: amount,
		},
	}) as unknown as Stripe.SubscriptionItem;

describe("matchStripeInlinePrice", () => {
	test("matches inline price data to equivalent Stripe prices", () => {
		expect(
			stripeInlinePriceMatchesStripePrice({
				inlinePrice,
				stripePrice: subscriptionItem().price,
			}),
		).toBe(true);
	});

	test("requires Autumn customer price metadata and matching price shape", () => {
		const items = [
			subscriptionItem({ id: "si_wrong_interval", interval: "year" }),
			subscriptionItem({
				id: "si_wrong_metadata",
				customerPriceId: "cus_price_other",
			}),
			subscriptionItem({ id: "si_match" }),
		];

		const match = findMatchingInlineSubscriptionItem({
			inlinePrice,
			metadata: { autumn_customer_price_id: "cus_price_inline" },
			subscriptionItems: items,
			usedSubscriptionItemIds: new Set(),
		});

		expect(match?.id).toBe("si_match");
	});

	test("does not reuse a subscription item twice", () => {
		const usedSubscriptionItemIds = new Set(["si_match"]);
		const match = findMatchingInlineSubscriptionItem({
			inlinePrice,
			metadata: { autumn_customer_price_id: "cus_price_inline" },
			subscriptionItems: [subscriptionItem({ id: "si_match" })],
			usedSubscriptionItemIds,
		});

		expect(match).toBeUndefined();
	});

	test("falls back to Autumn price metadata when customer price metadata is absent", () => {
		const match = findMatchingInlineSubscriptionItem({
			inlinePrice,
			metadata: {
				autumn_customer_price_id: "cus_price_inline",
				autumn_price_id: "price_inline_autumn",
			},
			subscriptionItems: [
				subscriptionItem({
					id: "si_legacy",
					customerPriceId: null,
					priceMetadataId: "price_inline_autumn",
				}),
			],
			usedSubscriptionItemIds: new Set(),
		});

		expect(match?.id).toBe("si_legacy");
	});

	test("does not fallback match ambiguous Autumn price metadata", () => {
		const match = findMatchingInlineSubscriptionItem({
			inlinePrice,
			metadata: {
				autumn_customer_price_id: "cus_price_inline",
				autumn_price_id: "price_inline_autumn",
			},
			subscriptionItems: [
				subscriptionItem({
					id: "si_legacy_1",
					customerPriceId: null,
					priceMetadataId: "price_inline_autumn",
				}),
				subscriptionItem({
					id: "si_legacy_2",
					customerPriceId: null,
					priceMetadataId: "price_inline_autumn",
				}),
			],
			usedSubscriptionItemIds: new Set(),
		});

		expect(match).toBeUndefined();
	});

	test("returns and reserves current price ids for schedule phase items", () => {
		const usedSubscriptionItemIds = new Set<string>();
		const priceId = findMatchingInlinePriceIdForPhaseItem({
			phaseItem: {
				price_data: inlinePrice,
				metadata: { autumn_customer_price_id: "cus_price_inline" },
			},
			stripeSubscription: {
				items: {
					data: [subscriptionItem({ id: "si_match" })],
				},
			} as Stripe.Subscription,
			usedSubscriptionItemIds,
		});

		expect(priceId).toBe("price_inline");
		expect(usedSubscriptionItemIds.has("si_match")).toBe(true);
	});
});
