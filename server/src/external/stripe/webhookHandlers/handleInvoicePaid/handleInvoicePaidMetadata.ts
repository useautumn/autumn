import { MetadataType } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { MetadataService } from "../../../../internal/metadata/MetadataService";
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

	await MetadataService.delete({
		db: ctx.db,
		id: metadata.id,
	});
};
