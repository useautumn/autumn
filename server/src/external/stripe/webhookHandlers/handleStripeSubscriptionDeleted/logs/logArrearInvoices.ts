import type { LineItem } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

/**
 * Logs arrear invoice creation result for a subscription deletion.
 */
export const logArrearInvoice = ({
	ctx,
	invoiceId,
	paid,
	lineItems,
}: {
	ctx: StripeWebhookContext;
	invoiceId: string;
	paid: boolean;
	lineItems: LineItem[];
}) => {
	addToExtraLogs({
		ctx,
		extras: {
			arrearInvoice: {
				invoiceId,
				paid,
				lineItems: lineItems.map(
					(item) => `${item.description}: ${item.finalAmount}`,
				),
			},
		},
	});
};
