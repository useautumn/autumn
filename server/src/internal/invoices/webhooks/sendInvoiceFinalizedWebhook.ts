import {
	type ApiListInvoiceV1,
	customerToSvixTags,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	InvoiceService,
	processInvoice,
} from "@/internal/invoices/InvoiceService.js";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos/index.js";
import { dbLineItemsToApiInvoiceItems } from "@/internal/invoices/lineItems/utils/dbLineItemsToApiInvoiceItems.js";

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

	const data: ApiListInvoiceV1 = {
		...processInvoice({ invoice: row.invoice }),
		id: row.invoice.id,
		customer_id: row.customer_id,
		entity_id: row.entity_id,
		amount_paid: row.invoice.amount_paid ?? null,
		refunded_amount: row.invoice.refunded_amount,
		items: dbLineItemsToApiInvoiceItems({ lineItems, features: ctx.features }),
	};

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
