import { MetadataType } from "@autumn/shared";
import { handleInvoiceActionRequiredCompleted } from "@/external/stripe/webhookHandlers/legacy/handleInvoicePaid/handleInvoiceActionRequiredCompleted.js";
import { handleInvoiceCheckoutPaid } from "@/external/stripe/webhookHandlers/legacy/handleInvoicePaid/handleInvoiceCheckoutPaid.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { executeDeferredBillingPlan } from "@/internal/billing/v2/execute/executeDeferredBillingPlan.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { MetadataService } from "@/internal/metadata/MetadataService.js";
import type { StripeInvoicePaidContext } from "../../setupStripeInvoicePaidContext.js";

export const handleStripeInvoiceMetadata = async ({
	ctx,
	invoicePaidContext,
}: {
	ctx: StripeWebhookContext;
	invoicePaidContext: StripeInvoicePaidContext;
}) => {
	const { stripeInvoice } = invoicePaidContext;
	const metadataId = stripeInvoice.metadata?.autumn_metadata_id;

	if (!metadataId) return;

	const metadata = await MetadataService.get({
		db: ctx.db,
		id: metadataId,
	});

	if (!metadata) return;

	// Handle deferred billing plan (v2 flow)
	if (metadata.type === MetadataType.DeferredInvoice) {
		await executeDeferredBillingPlan({ ctx, metadata });
		return;
	}

	// Legacy v1 flows below
	const data = metadata.data as unknown as AttachParams;
	const reqMatch =
		data.org?.id === ctx.org.id && data.customer?.env === ctx.env;

	if (!reqMatch) return;

	if (metadata.type === MetadataType.InvoiceActionRequired) {
		await handleInvoiceActionRequiredCompleted({
			ctx,
			invoice: stripeInvoice,
			metadata,
		});
		return;
	}

	await handleInvoiceCheckoutPaid({
		ctx,
		metadata,
	});
};
