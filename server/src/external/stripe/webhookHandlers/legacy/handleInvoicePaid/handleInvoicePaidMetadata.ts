import { MetadataType } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import type { AttachParams } from "../../../../../internal/customers/cusProducts/AttachParams.js";
import { MetadataService } from "../../../../../internal/metadata/MetadataService.js";
import { executeDeferredBillingPlan } from "@/internal/billing/v2/execute/executeDeferredBillingPlan";
import { handleInvoiceActionRequiredCompleted } from "./handleInvoiceActionRequiredCompleted";
import { handleInvoiceCheckoutPaid } from "./handleInvoiceCheckoutPaid";

export const handleInvoicePaidMetadata = async ({
	ctx,
	invoice,
}: {
	ctx: AutumnContext;
	invoice: Stripe.Invoice;
}) => {
	const metadataId = invoice.metadata?.autumn_metadata_id;

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
			invoice,
			metadata,
		});

		return;
	}

	await handleInvoiceCheckoutPaid({
		ctx,
		metadata,
	});
};
