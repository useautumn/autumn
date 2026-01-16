import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { StripeBillingPlanResult } from "@/internal/billing/v2/types/billingResult";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

const formatInvoice = (invoice: StripeBillingPlanResult["stripeInvoice"]) => {
	if (!invoice) return "none";

	const subscriptionId = stripeInvoiceToStripeSubscriptionId(invoice);
	const linkedTo = subscriptionId ? ` -> ${subscriptionId}` : " (standalone)";

	return `${invoice.id} (${invoice.status})${linkedTo}`;
};

export const logStripeBillingResult = ({
	ctx,
	result,
}: {
	ctx: AutumnContext;
	result: StripeBillingPlanResult;
}) => {
	addToExtraLogs({
		ctx,
		extras: {
			stripeBillingResult: {
				subscription: result.stripeSubscription?.id ?? "none",
				invoice: formatInvoice(result.stripeInvoice),
				requiredAction: result.requiredAction
					? `${result.requiredAction.code}: ${result.requiredAction.reason}`
					: "none",
				deferred: result.deferred ?? false,
			},
		},
	});
};
