import type { AutumnBillingPlan, FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { initSubscriptionFromStripe } from "@/internal/subscriptions/utils/initSubscriptionFromStripe.js";
import type { CreateCustomerContext } from "./createCustomerContext.js";

/**
 * Finalize customer creation after Stripe subscription is created.
 * Links subscription_ids back to customer products and builds final customer.
 */
export const finalizeCreateCustomer = async ({
	ctx,
	context,
	autumnBillingPlan,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	context: CreateCustomerContext;
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscription: Stripe.Subscription | undefined;
}): Promise<FullCustomer> => {
	const { fullCustomer } = context;

	if (!stripeSubscription) return fullCustomer;

	// Stripe stamped these onto the plan after its rows were inserted; the link-back is a plan of its own.
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: autumnBillingPlan.customerId,
			insertCustomerProducts: [],
			updateCustomerProducts: autumnBillingPlan.insertCustomerProducts.map(
				(customerProduct) => ({
					customerProduct,
					updates: {
						subscription_ids: customerProduct.subscription_ids ?? undefined,
						scheduled_ids: customerProduct.scheduled_ids ?? undefined,
					},
				}),
			),
		},
	});

	// Build final customer with subscription and products
	return {
		...fullCustomer,
		subscriptions: [initSubscriptionFromStripe({ ctx, stripeSubscription })],
		customer_products: autumnBillingPlan.insertCustomerProducts,
	};
};
