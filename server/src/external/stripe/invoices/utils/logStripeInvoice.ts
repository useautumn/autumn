import type Stripe from "stripe";
import type { Logger } from "@/external/logtail/logtailUtils";

/**
 * Logs core information from a Stripe invoice for debugging.
 */
export const logStripeInvoice = ({
	logger,
	stripeInvoice,
	prefix,
}: {
	logger: Logger;
	stripeInvoice: Stripe.Invoice;
	prefix?: string;
}) => {
	const tag = prefix ? `[${prefix}]` : "";

	logger.info(`${tag} Stripe Invoice`, {
		id: stripeInvoice.id,
		status: stripeInvoice.status,
		total: stripeInvoice.total,
		currency: stripeInvoice.currency,
		hosted_invoice_url: stripeInvoice.hosted_invoice_url,
		lines: stripeInvoice.lines.data.map((line) => ({
			description: line.description,
			amount: line.amount,
		})),
	});
};
