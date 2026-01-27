import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { StripeSubscriptionDeletedContext } from "../setupStripeSubscriptionDeletedContext";

/**
 * Voids invoices for a subscription that was deleted.
 *
 * When a subscription is deleted, it leaves unpaid invoices in an 'open' state.
 * We need to void these invoices to prevent customers from being charged for usage they won't receive.
 */
export const voidInvoicesForSubscriptionDeleted = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionDeletedContext;
}): Promise<void> => {
	const { logger, org } = ctx;
	const { stripeSubscription } = eventContext;
	const stripeCli = ctx.stripeCli;

	// Early return if feature is disabled
	if (!org.config.void_invoices_on_subscription_deletion) return;
	const stripeCustomerId = stripeSubscription.customer.id;
	const invoices = await stripeCli.invoices.list({
		customer: stripeCustomerId,
		subscription: stripeSubscription.id,
	});
	for (const invoice of invoices.data) {
		if (invoice.status === "open") {
			await stripeCli.invoices.voidInvoice(invoice.id);
			logger.info(`[sub.deleted] Voided open invoice ${invoice.id}`);
		}
	}
};
