import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
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

	// Link subscription_ids to customer products
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		await CusProductService.update({
			db: ctx.db,
			cusProductId: customerProduct.id,
			updates: { subscription_ids: customerProduct.subscription_ids },
		});
	}

	// Build final customer with subscription and products
	return {
		...fullCustomer,
		subscriptions: [initSubscriptionFromStripe({ ctx, stripeSubscription })],
		customer_products: autumnBillingPlan.insertCustomerProducts,
	};
};
