import { isStripeInvoiceForNewPeriod } from "@/external/stripe/invoices/utils/classifyStripeInvoice.js";
import { planPrepaidCycleResets } from "@/external/stripe/webhookHandlers/common/prepaidCycleReset/planPrepaidCycleResets";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { AutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";

/** A cycle invoice starts every product's new period, so every prepaid grant refills. Anchor moves refill in planBillingCycleAnchorReset. */
export const processPrepaidPricesForInvoiceCreated = ({
	ctx,
	eventContext,
	plan,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	plan: AutumnBillingPlanBuilder;
}): void => {
	if (!isStripeInvoiceForNewPeriod(eventContext.stripeInvoice)) return;

	planPrepaidCycleResets({
		ctx,
		eventContext,
		plan,
		customerProducts: eventContext.customerProducts,
	});
};
