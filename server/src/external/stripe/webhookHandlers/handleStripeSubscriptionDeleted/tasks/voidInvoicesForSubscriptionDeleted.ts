import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { StripeSubscriptionDeletedContext } from "../setupStripeSubscriptionDeletedContext";

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

		const voidableInvoices = invoices.data.filter(
			(invoice) =>
				invoice.status === "open" || invoice.status === "uncollectible",
		);

		await Promise.allSettled(
			voidableInvoices.map(async (invoice) => {
				await stripeCli.invoices.voidInvoice(invoice.id);
				logger.info(`[sub.deleted] Voided invoice ${invoice.id}`);
			}),
		);
	} catch (error) {
		logger.warn(
			`[sub.deleted] Failed to void invoices for subscription ${stripeSubscription.id}: ${error}`,
		);
	}
};
