import { describe, expect, test } from "bun:test";
import {
	BillWhen,
	BillingInterval,
	PriceType,
	type Price,
} from "@autumn/shared";
import { consumablePriceToStripeItem } from "@/external/stripe/priceToStripeItem/consumablePriceToStripeItem";

const consumablePrice = ({
	stripePriceId,
	stripeEmptyPriceId,
}: {
	stripePriceId?: string | null;
	stripeEmptyPriceId?: string | null;
}): Price =>
	({
		id: "price_usage",
		internal_product_id: "prod_internal",
		org_id: "org_1",
		created_at: 1,
		tier_behavior: null,
		is_custom: false,
		entitlement_id: "ent_1",
		proration_config: null,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			billing_units: 1,
			internal_feature_id: "feature_internal",
			feature_id: "messages",
			usage_tiers: [{ amount: 1, to: -1 }],
			interval: BillingInterval.Month,
			interval_count: 1,
			stripe_price_id: stripePriceId,
			stripe_empty_price_id: stripeEmptyPriceId,
			stripe_product_id: "prod_123",
		},
	}) as Price;

describe("consumablePriceToStripeItem", () => {
	test("uses the empty price placeholder for entity usage when present", () => {
		const item = consumablePriceToStripeItem({
			price: consumablePrice({
				stripePriceId: "price_usage",
				stripeEmptyPriceId: "price_empty",
			}),
			isCheckout: false,
			withEntity: true,
			fromVercel: false,
		});

		expect(item).toEqual({
			price: "price_empty",
			quantity: 0,
		});
	});

	test("falls back to the real usage price when no empty price exists", () => {
		const item = consumablePriceToStripeItem({
			price: consumablePrice({
				stripePriceId: "price_usage",
				stripeEmptyPriceId: null,
			}),
			isCheckout: false,
			withEntity: true,
			fromVercel: false,
		});

		expect(item).toEqual({
			price: "price_usage",
		});
	});
});
