import { isCustomerProductOnStripeSubscription } from "@autumn/shared";
import { isStripeSubscriptionPastDueTransition } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { stripeSubscriptionToLatestInvoice } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { StripeSubscriptionUpdatedContext } from "../stripeSubscriptionUpdatedContext";

// Long window so the now-manual invoice doesn't immediately read as overdue.
const SEND_INVOICE_DAYS_UNTIL_DUE = 365;

/**
 * Keeps an `ignore_past_due` plan's subscription alive when it goes past_due:
 * removes the open invoice from Stripe's auto-dunning and switches the sub to
 * send_invoice so Stripe's retry/cancel flow never tears it down.
 */
export const handleIgnorePastDue = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { stripeCli, logger } = ctx;
	const { stripeSubscription, previousAttributes, customerProducts } =
		subscriptionUpdatedContext;

	if (
		!isStripeSubscriptionPastDueTransition({
			stripeSubscription,
			previousAttributes,
		})
	)
		return;

	const ignorePastDue = customerProducts.some(
		(customerProduct) =>
			isCustomerProductOnStripeSubscription({
				customerProduct,
				stripeSubscriptionId: stripeSubscription.id,
			}) && customerProduct.product.config?.ignore_past_due,
	);
	if (!ignorePastDue) return;

	try {
		const latestInvoice = await stripeSubscriptionToLatestInvoice({
			stripeSubscription,
			stripeCli,
		});

		if (latestInvoice?.status === "open" && latestInvoice.id) {
			await stripeCli.invoices.update(latestInvoice.id, {
				auto_advance: false,
			});
		}

		await stripeCli.subscriptions.update(stripeSubscription.id, {
			collection_method: "send_invoice",
			days_until_due: SEND_INVOICE_DAYS_UNTIL_DUE,
		});

		logger.info(
			`[sub.updated] ignore_past_due: kept subscription ${stripeSubscription.id} alive (send_invoice, invoice auto_advance off)`,
		);
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(
			`[sub.updated] ignore_past_due: failed to preserve subscription ${stripeSubscription.id}: ${errorMessage}`,
		);
	}
};
