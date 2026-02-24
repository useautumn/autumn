import { notNullish } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import type { CheckoutSessionCompletedContext } from "../setupCheckoutSessionCompletedContext";

/**
 * Syncs customer name/email from Stripe checkout session to Autumn.
 * Only updates if Autumn is missing the field and Stripe has it.
 */
export const updateCustomerFromCheckout = async ({
	ctx,
	checkoutSessionContext,
}: {
	ctx: StripeWebhookContext;
	checkoutSessionContext: CheckoutSessionCompletedContext;
}) => {
	const { db, org, env, fullCustomer } = ctx;

	const { stripeCheckoutSession } = checkoutSessionContext;

	const customerDetails = stripeCheckoutSession.customer_details;
	if (!fullCustomer || !customerDetails) return;

	const updates: { name?: string; email?: string } = {};

	// Only update if Autumn is missing the field and Stripe has it
	if (!fullCustomer.name && notNullish(customerDetails.name)) {
		updates.name = customerDetails.name;
	}

	if (!fullCustomer.email && notNullish(customerDetails.email)) {
		updates.email = customerDetails.email;
	}

	// Skip if no updates needed
	if (!updates.name && !updates.email) return;

	await CusService.update({
		ctx,
		idOrInternalId: fullCustomer.id || fullCustomer.internal_id,
		update: updates,
	});

	ctx.logger.info(
		`[checkout.completed] Updated customer ${fullCustomer.id} with name=${updates.name ?? "(unchanged)"}, email=${updates.email ?? "(unchanged)"}`,
	);
};
