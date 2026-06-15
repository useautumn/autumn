import type { Stripe } from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { invoiceActions } from "@/internal/invoices/actions";

const VOIDABLE_STATUSES: Stripe.Invoice.Status[] = ["open", "uncollectible"];

/**
 * Void every open/uncollectible invoice on a Stripe subscription, then mirror the new status
 * into Autumn's invoice records. Per-invoice failures are tolerated (the subscription.deleted
 * webhook can race this for the same invoices, and Stripe rejects voiding an already-voided one)
 * but are counted and returned so the caller can surface a partial failure.
 */
export const voidOpenInvoicesForStripeSubscription = async ({
	ctx,
	stripeCli,
	customerId,
	stripeCustomerId,
	subscriptionId,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	customerId: string;
	stripeCustomerId: string;
	subscriptionId: string;
}): Promise<{ voided: number; failed: number }> => {
	const { logger } = ctx;

	const voidableInvoices: Stripe.Invoice[] = [];
	let startingAfter: string | undefined;

	while (true) {
		const page = await stripeCli.invoices.list({
			customer: stripeCustomerId,
			subscription: subscriptionId,
			limit: 100,
			starting_after: startingAfter,
		});

		for (const invoice of page.data) {
			if (VOIDABLE_STATUSES.includes(invoice.status ?? "draft")) {
				voidableInvoices.push(invoice);
			}
		}

		if (!page.has_more) break;
		startingAfter = page.data[page.data.length - 1]?.id;
		if (!startingAfter) break;
	}

	let failed = 0;
	await Promise.all(
		voidableInvoices.map(async (invoice) => {
			try {
				const voidedInvoice = await stripeCli.invoices.voidInvoice(invoice.id);
				await invoiceActions.updateFromStripe({
					ctx,
					customerId,
					stripeInvoice: voidedInvoice,
				});
				logger.info(
					`[voidOpenInvoicesForStripeSubscription] Voided invoice ${invoice.id}`,
				);
			} catch (error) {
				failed++;
				logger.warn(
					`[voidOpenInvoicesForStripeSubscription] Failed to void invoice ${invoice.id}: ${error}`,
				);
			}
		}),
	);

	return { voided: voidableInvoices.length - failed, failed };
};
