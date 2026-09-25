import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	Infinite,
	type Price,
	PriceType,
	ProcessorType,
	type Product,
} from "@autumn/shared";
import type Stripe from "stripe";
import { stripeCandidateMatchesAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/stripeCandidateMatchesAutumnPrice";
import { normalizeStripePhaseItem } from "@/internal/billing/v2/providers/stripe/utils/sync/normalizeStripeObject";

const prepaidCreditsPrice = (): Price =>
	({
		id: "pr_credits",
		internal_product_id: "product_internal",
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.StartOfPeriod,
			interval: BillingInterval.Month,
			billing_units: 1,
			feature_id: "ai_credits",
			internal_feature_id: "fe_credits",
			usage_tiers: [{ to: Infinite, amount: 0, flat_amount: 145 }],
			stripe_price_id: "price_credits_catalog",
			stripe_product_id: "prod_ai_credits",
		},
		proration_config: null,
	}) as unknown as Price;

const creditsAddOn = (): Product =>
	({
		id: "credits_add-on",
		internal_id: "product_internal",
		processor: { id: "prod_add_on", type: ProcessorType.Stripe },
	}) as Product;

const phaseItem = ({
	price,
}: {
	price: string | Stripe.Price;
}): Stripe.SubscriptionSchedule.Phase.Item =>
	({ price, quantity: 1 }) as unknown as Stripe.SubscriptionSchedule.Phase.Item;

const inlineCreditsPrice = {
	id: "price_inline_500",
	object: "price",
	active: false,
	currency: "usd",
	product: "prod_ai_credits",
	unit_amount: 50000,
	recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
} as unknown as Stripe.Price;

const matches = ({ item }: { item: Stripe.SubscriptionSchedule.Phase.Item }) =>
	stripeCandidateMatchesAutumnPrice({
		candidate: normalizeStripePhaseItem({ phaseItem: item }),
		stripePrice:
			typeof item.price === "object" ? (item.price as Stripe.Price) : undefined,
		price: prepaidCreditsPrice(),
		product: creditsAddOn(),
	});

describe("stripeCandidateMatchesAutumnPrice", () => {
	test("a priced item on the same Stripe product but a different price does not pair", () => {
		expect(matches({ item: phaseItem({ price: inlineCreditsPrice }) })).toBe(
			false,
		);
	});

	test("an item billing the price's own Stripe price pairs", () => {
		expect(
			matches({
				item: phaseItem({
					price: { ...inlineCreditsPrice, id: "price_credits_catalog" },
				}),
			}),
		).toBe(true);
	});
});
