import { msToSeconds } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

/**
 * Creates a Stripe subscription for a customer using an inline price
 * derived from the Autumn product's Stripe processor ID.
 */
export const createCustomStripeSubscription = async ({
	ctx,
	customerId,
	productId,
	unitAmount = 2000,
	interval = "month",
	billingCycleAnchorMs,
	prorationBehavior,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	unitAmount?: number;
	interval?: Stripe.PriceCreateParams.Recurring.Interval;
	billingCycleAnchorMs?: number;
	prorationBehavior?: Stripe.SubscriptionCreateParams.ProrationBehavior;
}): Promise<Stripe.Subscription> => {
	const [fullCustomer, fullProduct] = await Promise.all([
		CusService.getFull({ ctx, idOrInternalId: customerId }),
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: productId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
	]);

	const stripeCustomerId = fullCustomer.processor.id ?? "";
	const stripeProductId = fullProduct.processor?.id ?? "";

	return ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [
			{
				price_data: {
					currency: "usd",
					product: stripeProductId,
					unit_amount: unitAmount,
					recurring: { interval },
				},
			},
		],
		...(billingCycleAnchorMs !== undefined && {
			billing_cycle_anchor: msToSeconds(billingCycleAnchorMs),
		}),
		...(prorationBehavior !== undefined && {
			proration_behavior: prorationBehavior,
		}),
	});
};
