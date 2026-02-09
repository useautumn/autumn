import type { DeferredAutumnBillingPlanData } from "@autumn/shared";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";

export const modifyStripeSubscriptionFromCheckout = async ({
	ctx,
	checkoutContext,
	deferredData,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
	deferredData: DeferredAutumnBillingPlanData;
}) => {
	const { stripeCli } = ctx;
	const { billingContext, billingPlan } = deferredData;
	const { subscriptionAction } = await evaluateStripeBillingPlan({
		ctx,
		billingContext: {
			...billingContext,
			stripeSubscription: checkoutContext.stripeSubscription,
		},
		autumnBillingPlan: billingPlan.autumn,
	});

	// Get update action
	const updateAction =
		subscriptionAction?.type === "update" ? subscriptionAction : undefined;

	if (!updateAction) return;

	await stripeCli.subscriptions.update(updateAction.stripeSubscriptionId, {
		...updateAction.params,
		payment_behavior: "error_if_incomplete",
		expand: ["latest_invoice"],
	});

	logStripeBillingPlan({
		ctx,
		stripeBillingPlan: {
			subscriptionAction: updateAction,
		},
		billingContext,
	});
};
