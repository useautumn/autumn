import type { DeferredAutumnBillingPlanData } from "@autumn/shared";
import { updateOptionsFromStripeCheckoutSession } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/updateOptionsFromStripeCheckoutSession";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addStripeSubscriptionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionIdToBillingPlan";
import { initInvoiceFromStripe } from "@/internal/invoices/utils/initInvoiceFromStripe";
import { initSubscriptionFromStripe } from "@/internal/subscriptions/utils/initSubscriptionFromStripe";
import type { CheckoutSessionCompletedContext } from "../../setupCheckoutSessionCompletedContext";

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

	const updatedAutumnPlan = { ...billingPlan.autumn };

	if (stripeSubscription) {
		const subscription = initSubscriptionFromStripe({
			ctx,
			stripeSubscription,
		});
		updatedAutumnPlan.upsertSubscriptions = [subscription];
		ctx.logger.debug(
			`[checkout.completed] Added upsertSubscriptions: ${subscription.stripe_id}`,
		);
	}

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

	if (stripeSubscription) {
		addStripeSubscriptionIdToBillingPlan({
			autumnBillingPlan: updatedAutumnPlan,
			stripeSubscriptionId: stripeSubscription.id,
		});
	}

	await updateOptionsFromStripeCheckoutSession({
		checkoutContext,
		deferredData,
	});

	return {
		...deferredData,
		billingPlan: {
			...billingPlan,
			autumn: updatedAutumnPlan,
		},
	};
};
