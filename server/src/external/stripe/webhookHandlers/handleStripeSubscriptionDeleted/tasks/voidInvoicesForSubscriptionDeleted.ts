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

	if (!org.config.void_invoices_on_subscription_deletion) return;

	const stripeCustomerId = stripeSubscription.customer.id;

	try {
		const invoices = await stripeCli.invoices.list({
			customer: stripeCustomerId,
			subscription: stripeSubscription.id,
		});

		const openInvoices = invoices.data.filter(
			(invoice) => invoice.status === "open",
		);

		await Promise.allSettled(
			openInvoices.map(async (invoice) => {
				await stripeCli.invoices.voidInvoice(invoice.id);
				logger.info(`[sub.deleted] Voided open invoice ${invoice.id}`);
			}),
		);
	} catch (error) {
		logger.warn(
			`[sub.deleted] Failed to void invoices for subscription ${stripeSubscription.id}: ${error}`,
		);
	}
};
