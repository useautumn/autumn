import { describe, expect, test } from "bun:test";
import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import { customerProductsToOngoingStripePriceIds } from "@/internal/billing/v2/actions/sync/utils/customerProductsToOngoingStripePriceIds";

const STRIPE_SUBSCRIPTION_ID = "sub_123";

const customerProduct = ({
	status,
	stripePriceId,
	endedAt = null,
}: {
	status: CusProductStatus;
	stripePriceId: string;
	endedAt?: number | null;
}) =>
	({
		status,
		ended_at: endedAt,
		subscription_ids: [STRIPE_SUBSCRIPTION_ID],
		customer_prices: [
			{ price: { config: { stripe_price_id: stripePriceId } } },
		],
	}) as unknown as FullCusProduct;

describe("customerProductsToOngoingStripePriceIds", () => {
	test("counts live and trialing plans on the subscription, but not ending or expired ones", () => {
		const priceIds = customerProductsToOngoingStripePriceIds({
			customerProducts: [
				customerProduct({
					status: CusProductStatus.Active,
					stripePriceId: "price_active",
				}),
				customerProduct({
					status: CusProductStatus.Trialing,
					stripePriceId: "price_trialing",
				}),
				customerProduct({
					status: CusProductStatus.Active,
					stripePriceId: "price_ending",
					endedAt: 1_900_000_000_000,
				}),
				customerProduct({
					status: CusProductStatus.Expired,
					stripePriceId: "price_expired",
				}),
			],
			stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
		});

		expect([...priceIds].sort()).toEqual(["price_active", "price_trialing"]);
	});
});
