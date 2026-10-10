import type { StripeBillingPlanResult } from "@autumn/shared";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import { setRootSpanAttributes } from "@/utils/otel/rootSpan.js";

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
	setRootSpanAttributes({
		"stripe.subscription_id": result.stripeSubscription?.id,
		"stripe.invoice_id": result.stripeInvoice?.id,
		"billing.deferred": result.deferred ?? false,
	});

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
