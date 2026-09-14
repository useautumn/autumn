import { customerToSvixTags, WebhookEventType } from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos/index.js";
import { invoiceListRowToApi } from "@/internal/invoices/utils/invoiceListRowToApi.js";

/** Body must equal the `invoices.list` row so deliveries are replayable. */
export const sendInvoiceFinalizedWebhook = async ({
	ctx,
	autumnInvoiceId,
}: {
	ctx: AutumnContext;
	autumnInvoiceId: string;
}) => {
	const row = await InvoiceService.getListRowById({ ctx, id: autumnInvoiceId });
	if (!row) {
		ctx.logger.warn(
			`[sendInvoiceFinalizedWebhook] Invoice ${autumnInvoiceId} not found, skipping`,
		);
		return;
	}

	const lineItems = await invoiceLineItemRepo.getByInvoiceIds({
		db: ctx.db,
		invoiceIds: [autumnInvoiceId],
	});

	const data = invoiceListRowToApi({ ctx, row, lineItems });

	await sendSvixEvent({
		ctx,
		eventType: WebhookEventType.InvoiceFinalized,
		data,
		idempotencyKey: `invoice.finalized:${row.invoice.stripe_id}`,
		tags: customerToSvixTags({
			customerId: row.customer_id ?? row.invoice.internal_customer_id,
			entityId: row.entity_id,
		}),
	});
};
