import type {
	BillingPlan,
	BillingResult,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { voidOpenInvoicesForStripeSubscription } from "@/external/stripe/invoices/operations/voidOpenInvoicesForStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const voidInvoicesOnImmediateCancel = async ({
	ctx,
	billingContext,
	billingPlan,
	billingResult,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
	billingResult: BillingResult;
}): Promise<void> => {
	if (!ctx.org.config.void_invoices_on_subscription_deletion) return;
	if (billingContext.cancelAction !== "cancel_immediately") return;
	if (billingResult.stripe.deferred) return;

	if (billingPlan.stripe.subscriptionAction?.type !== "cancel") return;

	const { stripeSubscription, stripeCustomer, fullCustomer } = billingContext;
	if (!stripeSubscription || !stripeCustomer) return;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const { failed } = await voidOpenInvoicesForStripeSubscription({
		ctx,
		stripeCli,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		stripeCustomerId: stripeCustomer.id,
		subscriptionId: stripeSubscription.id,
	});

	if (failed > 0) {
		ctx.logger.error(
			`[voidInvoicesOnImmediateCancel] ${failed} invoice(s) failed to void for subscription ${stripeSubscription.id}; they may still be open in Stripe`,
		);
	}
};
