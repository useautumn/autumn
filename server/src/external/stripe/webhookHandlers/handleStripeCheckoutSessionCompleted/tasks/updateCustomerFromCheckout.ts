import { type Customer, notNullish } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusService } from "@/internal/customers/CusService";

/**
 * Syncs customer name/email from Stripe checkout session to Autumn.
 * Only updates if Autumn is missing the field and Stripe has it.
 */
export const updateCustomerFromCheckout = async ({
	ctx,
	customer,
	stripeCheckoutSession,
}: {
	ctx: StripeWebhookContext;
	customer: Customer;
	stripeCheckoutSession: Stripe.Checkout.Session;
}) => {
	const { db, org, env } = ctx;

	const customerDetails = stripeCheckoutSession.customer_details;
	if (!customerDetails) return;

	const updates: { name?: string; email?: string } = {};

	// Only update if Autumn is missing the field and Stripe has it
	if (!customer.name && notNullish(customerDetails.name)) {
		updates.name = customerDetails.name;
	}

	if (!customer.email && notNullish(customerDetails.email)) {
		updates.email = customerDetails.email;
	}

	// Skip if no updates needed
	if (!updates.name && !updates.email) return;

	await CusService.update({
		db,
		idOrInternalId: customer.internal_id,
		orgId: org.id,
		env,
		update: updates,
	});

	ctx.logger.info(
		`[checkout.completed] Updated customer ${customer.id} with name=${updates.name ?? "(unchanged)"}, email=${updates.email ?? "(unchanged)"}`,
	);
};
