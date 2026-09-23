import type { Customer } from "@autumn/shared";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers/index.js";
import type { ExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";

/** The customer's Stripe customer, created if missing; a new one is recorded on the customer through the billing plan executor. */
export const linkStripeCustomer = async ({
	ctx,
	customer,
}: {
	ctx: AutumnContext;
	customer: Customer;
}): Promise<ExpandedStripeCustomer | undefined> => {
	const linkedStripeCustomerId = customer.processor?.id;
	const stripeCustomer = await getOrCreateStripeCustomer({
		ctx,
		customer,
		options: { updateDb: false },
	});
	const createdStripeCustomer =
		customer.processor?.id && customer.processor.id !== linkedStripeCustomerId;
	if (createdStripeCustomer)
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId: customer.id ?? customer.internal_id,
				insertCustomerProducts: [],
				updateCustomer: {
					customer,
					updates: { processor: customer.processor },
				},
			},
		});
	return stripeCustomer;
};
