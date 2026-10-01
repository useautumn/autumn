import {
	type DeferredAutumnBillingPlanData,
	MetadataType,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeDeferredInvoicePlanOnce } from "@/internal/billing/v2/execute/executeDeferredInvoicePlanOnce";
import { isImmediateInvoiceMode } from "@/internal/billing/v2/utils/billingContext/isImmediateInvoiceMode";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** Enable-immediately invoice-mode plans held pending on a draft invoice activate once it is finalized. */
export const activatePendingPlanOnInvoiceFinalized = async ({
	ctx,
	stripeInvoice,
}: {
	ctx: StripeWebhookContext;
	stripeInvoice: Stripe.Invoice;
}) => {
	const metadataId = stripeInvoice.metadata?.autumn_metadata_id;
	if (!metadataId) return;

	const metadata = await MetadataService.get({ db: ctx.db, id: metadataId });
	if (metadata?.type !== MetadataType.DeferredInvoice) return;

	const { billingContext } = metadata.data as DeferredAutumnBillingPlanData;
	if (!isImmediateInvoiceMode({ billingContext })) return;

	ctx.logger.info(
		`[invoice.finalized] Activating pending plan for invoice ${stripeInvoice.id}`,
	);

	await executeDeferredInvoicePlanOnce({ ctx, metadata, stripeInvoice });
};
