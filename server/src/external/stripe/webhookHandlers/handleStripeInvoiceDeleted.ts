import type Stripe from "stripe";
import { expirePendingPlanForVoidedInvoice } from "@/internal/billing/v2/actions/expirePendingPlan/expirePendingPlanForVoidedInvoice";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext";

/** Only drafts can be deleted in Stripe; a deleted draft can never be finalized, so its pending plan expires. */
export const handleStripeInvoiceDeleted = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceDeletedEvent;
}) => {
	await expirePendingPlanForVoidedInvoice({
		ctx,
		stripeInvoice: event.data.object,
		customerId: ctx.customerId,
	});
};
