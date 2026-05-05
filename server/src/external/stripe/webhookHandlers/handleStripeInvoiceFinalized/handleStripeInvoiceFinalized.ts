import type Stripe from "stripe";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { getExpandedStripeSubscription } from "@/external/stripe/subscriptions";
import { storeRenewalLineItems } from "@/external/stripe/webhookHandlers/common";
import { invoiceActions } from "@/internal/invoices/actions";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { setupInvoiceFinalizedContext } from "./setupInvoiceFinalizedContext";
import { processVercelInvoice } from "./tasks/processVercelInvoice";

/**
 * Handles invoice.finalized webhook.
 *
 * For regular invoices: Creates/updates Autumn invoice records and stores line items.
 * For Vercel custom payment method invoices: Submits invoice to Vercel marketplace for payment processing.
 */
export const handleStripeInvoiceFinalized = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceFinalizedEvent;
}) => {
	const stripeInvoice = await getStripeInvoice({
		stripeClient: ctx.stripeCli,
		invoiceId: event.data.object.id!,
		expand: ["discounts.source.coupon", "total_discount_amounts"],
	});

	const stripeSubscriptionId =
		stripeInvoiceToStripeSubscriptionId(stripeInvoice);

	const stripeSubscription = stripeSubscriptionId
		? await getExpandedStripeSubscription({
				ctx,
				subscriptionId: stripeSubscriptionId,
			})
		: null;

	await processVercelInvoice({ ctx, stripeInvoice, stripeSubscription });

	const eventContext = await setupInvoiceFinalizedContext({ ctx, event });

	if (!eventContext) {
		ctx.logger.debug("[invoice.finalized] Skipping - context not found");
		return;
	}

	ctx.logger.info(
		`[invoice.finalized] Processing for invoice ${eventContext.stripeInvoice.id}`,
	);

	// 2. Upsert Autumn invoice record
	const autumnInvoice = await invoiceActions.updateFromStripe({
		ctx,
		customerId: ctx.fullCustomer?.id ?? "",
		stripeInvoice: eventContext.stripeInvoice,
	});

	// 3. Reconcile invoice line items (async workflow)
	// Uses reconcileOnly mode to only update Stripe-authoritative fields (amounts,
	// quantities, discounts), preserving Autumn metadata set during invoice.created.
	if (autumnInvoice) {
		await storeRenewalLineItems({
			ctx,
			autumnInvoice,
			stripeInvoiceId: eventContext.stripeInvoice.id,
			arrearLineItems: [],
			reconcileOnly: true,
		});
	}
};
