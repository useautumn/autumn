import type { DeferredAutumnBillingPlanData } from "@autumn/shared";
import { updateOptionsFromStripeCheckoutSession } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/updateOptionsFromStripeCheckoutSession";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addStripeSubscriptionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionIdToBillingPlan";
import { initInvoiceFromStripe } from "@/internal/invoices/utils/initInvoiceFromStripe";
import { initSubscriptionFromStripe } from "@/internal/subscriptions/utils/initSubscriptionFromStripe";
import type { CheckoutSessionCompletedContext } from "../../setupCheckoutSessionCompletedContext";

/**
 * Updates the billing plan with checkout-specific data:
 * 1. Adds upsertSubscription from Stripe subscription
 * 2. Adds upsertInvoice from Stripe invoice
 * 3. (Future) Captures prepaid quantities from checkout line items
 *
 * Returns a new copy of the billing plan data with updates applied.
 */
export const updateBillingPlanFromCheckout = async ({
	ctx,
	checkoutContext,
	deferredData,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
	deferredData: DeferredAutumnBillingPlanData;
}): Promise<DeferredAutumnBillingPlanData> => {
	const { stripeSubscription, stripeInvoice } = checkoutContext;
	const { billingPlan, billingContext } = deferredData;

	// Create a shallow copy of the autumn billing plan
	const updatedAutumnPlan = { ...billingPlan.autumn };

	// 1. Build upsertSubscription from Stripe subscription
	if (stripeSubscription) {
		const subscription = initSubscriptionFromStripe({
			ctx,
			stripeSubscription,
		});
		updatedAutumnPlan.upsertSubscription = subscription;
		ctx.logger.debug(
			`[checkout.completed] Added upsertSubscription: ${subscription.stripe_id}`,
		);
	}

	// 2. Build upsertInvoice from Stripe invoice
	if (stripeInvoice) {
		const invoice = await initInvoiceFromStripe({
			ctx,
			stripeInvoice,
			fullProducts: billingContext.fullProducts,
			fullCustomer: billingContext.fullCustomer,
		});
		updatedAutumnPlan.upsertInvoice = invoice;
		ctx.logger.debug(
			`[checkout.completed] Added upsertInvoice: ${invoice.stripe_id}`,
		);
	}

	// 3. Update subscription ID
	if (stripeSubscription) {
		addStripeSubscriptionIdToBillingPlan({
			autumnBillingPlan: updatedAutumnPlan,
			stripeSubscriptionId: stripeSubscription.id,
		});
	}

	// 3. TODO: Capture prepaid quantities from checkout line items
	await updateOptionsFromStripeCheckoutSession({
		checkoutContext,
		deferredData,
	});

	// Return updated billing plan data (new copy)
	return {
		...deferredData,
		billingPlan: {
			...billingPlan,
			autumn: updatedAutumnPlan,
		},
	};
};
