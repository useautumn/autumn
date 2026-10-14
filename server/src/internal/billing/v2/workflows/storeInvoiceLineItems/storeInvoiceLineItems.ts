import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { storeLineItems } from "@/internal/invoices/lineItems/actions/storeLineItems.js";
import { sendInvoiceFinalizedWebhook } from "@/internal/invoices/webhooks/sendInvoiceFinalizedWebhook.js";
import type { StoreInvoiceLineItemsPayload } from "@/queue/workflows.js";

export const storeInvoiceLineItems = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: StoreInvoiceLineItemsPayload;
}): Promise<void> => {
	const {
		stripeInvoiceId,
		autumnInvoiceId,
		billingLineItems,
		reconcileOnly,
		emitFinalizedWebhook,
	} = payload;

	try {
		await storeLineItems({
			ctx,
			stripeInvoiceId,
			autumnInvoiceId,
			billingLineItems,
			reconcileOnly,
		});
	} catch (error) {
		ctx.logger.error(
			`[storeInvoiceLineItems] Failed for ${stripeInvoiceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		if (emitFinalizedWebhook) throw error;
		return;
	}

	if (emitFinalizedWebhook) {
		await sendInvoiceFinalizedWebhook({ ctx, autumnInvoiceId });
	}
};
