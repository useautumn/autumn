import {
	type Customer,
	type CustomerData,
	ProcessorType,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { autoSyncStripeCustomerWithLock } from "@/internal/billing/v2/actions/sync/autoSyncStripeCustomer.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { updateCachedCustomerData } from "@/internal/customers/cache/fullSubject/actions/updateCachedCustomerData.js";

/** Links an existing, unlinked customer to the `stripe_id` it is sent and imports that Stripe customer's billing, as creation does. */
export const linkStripeIdFromCustomerData = async ({
	ctx,
	customer,
	customerData,
}: {
	ctx: AutumnContext;
	customer: Customer;
	customerData?: CustomerData;
}): Promise<boolean> => {
	const stripeCustomerId = customerData?.stripe_id;
	const linkedStripeCustomerId = customer.processor?.id;
	if (!stripeCustomerId || linkedStripeCustomerId === stripeCustomerId)
		return false;

	const customerId = customer.id ?? customer.internal_id;
	if (linkedStripeCustomerId) {
		ctx.logger.warn(
			`[linkStripeIdFromCustomerData] ${customerId} is linked to ${linkedStripeCustomerId}; ignoring stripe_id ${stripeCustomerId}`,
		);
		return false;
	}

	// Reject an unknown Stripe customer before the link is written.
	await createStripeCli({ org: ctx.org, env: ctx.env }).customers.retrieve(
		stripeCustomerId,
	);

	const processor = { id: stripeCustomerId, type: ProcessorType.Stripe };
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId,
			insertCustomerProducts: [],
			updateCustomer: { customer, updates: { processor } },
		},
	});
	await updateCachedCustomerData({ ctx, customerId, updates: { processor } });
	Object.assign(customer, { processor });

	await autoSyncStripeCustomerWithLock({ ctx, customerId, stripeCustomerId });
	return true;
};
