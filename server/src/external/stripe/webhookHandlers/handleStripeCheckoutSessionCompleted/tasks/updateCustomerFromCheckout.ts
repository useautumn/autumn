import { notNullish } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import type { CheckoutSessionCompletedContext } from "../setupCheckoutSessionCompletedContext";

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

	if (!fullCustomer.name && notNullish(customerDetails.name)) {
		updates.name = customerDetails.name;
	}

	if (!fullCustomer.email && notNullish(customerDetails.email)) {
		updates.email = customerDetails.email;
	}

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
